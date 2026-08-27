import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

export const coursesRouter = Router();
coursesRouter.use(requireAuth);

const catalogAccessWhere = (userId: string) => ({
  grants: {
    some: {
      OR: [
        { userId },
        { group: { members: { some: { userId } } } },
      ],
    },
  },
});

coursesRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const internal = ["ADMIN", "STAFF"].includes(req.user!.role);
  const catalogs = await prisma.courseCatalog.findMany({
    where: {
      ...(internal ? {} : { status: "PUBLISHED" as const, ...catalogAccessWhere(req.user!.id) }),
      ...(q ? {
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { academicYear: { contains: q, mode: "insensitive" as const } },
          { program: { name: { contains: q, mode: "insensitive" as const } } },
          { courses: { some: { OR: [
            { code: { contains: q, mode: "insensitive" as const } },
            { title: { contains: q, mode: "insensitive" as const } },
          ] } } },
        ],
      } : {}),
    },
    include: { program: true, _count: { select: { courses: true, grants: true } } },
    orderBy: [{ academicYear: "desc" }, { title: "asc" }],
  });
  res.json({ catalogs });
});

coursesRouter.get("/:id", async (req, res) => {
  const internal = ["ADMIN", "STAFF"].includes(req.user!.role);
  const catalog = await prisma.courseCatalog.findFirst({
    where: {
      id: String(req.params.id),
      ...(internal ? {} : { status: "PUBLISHED" as const, ...catalogAccessWhere(req.user!.id) }),
    },
    include: {
      program: true,
      courses: {
        include: { modules: { orderBy: { position: "asc" } }, resources: true },
        orderBy: [{ semester: "asc" }, { position: "asc" }],
      },
    },
  });
  if (!catalog) return res.status(404).json({ error: "Catalog not found or not granted." });
  res.json({ catalog });
});

coursesRouter.get("/resources/:resourceId/access", async (req, res) => {
  const resource = await prisma.courseResource.findUnique({
    where: { id: String(req.params.resourceId) },
    include: { course: { include: { catalog: true } } },
  });
  if (!resource) return res.status(404).json({ error: "Resource not found." });
  const internal = ["ADMIN", "STAFF"].includes(req.user!.role);
  if (!internal) {
    const allowed = await prisma.courseCatalog.count({
      where: { id: resource.course.catalogId, status: "PUBLISHED", ...catalogAccessWhere(req.user!.id) },
    });
    if (!allowed) return res.status(403).json({ error: "Not permitted." });
  }
  if (resource.externalUrl) return res.json({ url: resource.externalUrl, external: true });
  if (!resource.storagePath) return res.status(404).json({ error: "Resource file is missing." });
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: "Storage is not configured." });
  const { data, error } = await supabase.storage
    .from(process.env.SUPABASE_COURSE_BUCKET ?? "course-resources")
    .createSignedUrl(resource.storagePath, 60);
  if (error) return res.status(502).json({ error: "Could not create a secure download link." });
  res.json({ url: data.signedUrl, expiresIn: 60 });
});

coursesRouter.get("/admin/programs/list", requireRole("ADMIN"), async (_req, res) => {
  res.json({ programs: await prisma.program.findMany({ orderBy: { name: "asc" } }) });
});

coursesRouter.get("/admin/groups", requireRole("ADMIN"), async (_req, res) => {
  const groups = await prisma.accessGroup.findMany({
    include: { _count: { select: { members: true, grants: true } } },
    orderBy: { name: "asc" },
  });
  res.json({ groups });
});

coursesRouter.post("/admin/groups", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(160), description: z.string().trim().max(1000).nullish() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid group." });
  const group = await prisma.accessGroup.create({ data: parsed.data });
  res.status(201).json({ group });
});

coursesRouter.post("/admin/groups/:id/members", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({
    userIds: z.array(z.string().uuid()).default([]),
    eventId: z.string().uuid().optional(),
    tagId: z.string().uuid().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid group membership." });
  const ids = new Set(parsed.data.userIds);
  if (parsed.data.eventId) {
    const guests = await prisma.eventInvitation.findMany({
      where: { eventId: parsed.data.eventId, contact: { account: { isNot: null } } },
      include: { contact: { include: { account: true } } },
    });
    guests.forEach((g) => g.contact.account && ids.add(g.contact.account.id));
  }
  if (parsed.data.tagId) {
    const guests = await prisma.contact.findMany({
      where: { tags: { some: { tagId: parsed.data.tagId } }, account: { isNot: null } },
      include: { account: true },
    });
    guests.forEach((g) => g.account && ids.add(g.account.id));
  }
  await prisma.accessGroupMember.createMany({
    data: [...ids].map((userId) => ({ groupId: String(req.params.id), userId })),
    skipDuplicates: true,
  });
  res.json({ added: ids.size });
});

coursesRouter.post("/admin/programs", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(160),
    code: z.string().trim().min(1).max(30),
    description: z.string().trim().max(2000).nullish(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid program." });
  const program = await prisma.program.create({ data: { ...parsed.data, code: parsed.data.code.toUpperCase() } });
  res.status(201).json({ program });
});

coursesRouter.post("/admin/catalogs", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({
    programId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    academicYear: z.string().trim().min(1).max(30),
    version: z.string().trim().min(1).max(30),
    description: z.string().trim().max(4000).nullish(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid catalog." });
  const catalog = await prisma.courseCatalog.create({ data: parsed.data });
  res.status(201).json({ catalog });
});

coursesRouter.patch("/admin/catalogs/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).nullish(),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid catalog update." });
  const current = await prisma.courseCatalog.findUnique({ where: { id: String(req.params.id) } });
  if (!current) return res.status(404).json({ error: "Catalog not found." });
  if (current.status === "PUBLISHED" && parsed.data.status !== "ARCHIVED") {
    return res.status(409).json({ error: "Published catalogs are immutable; create a new version." });
  }
  const catalog = await prisma.courseCatalog.update({
    where: { id: current.id },
    data: { ...parsed.data, ...(parsed.data.status === "PUBLISHED" ? { publishedAt: new Date() } : {}) },
  });
  res.json({ catalog });
});

coursesRouter.post("/admin/catalogs/:id/courses", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({
    code: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(240),
    semester: z.number().int().min(1).max(20),
    credits: z.number().int().min(0).max(100).nullish(),
    description: z.string().trim().max(8000).nullish(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid course." });
  const course = await prisma.course.create({ data: { catalogId: String(req.params.id), ...parsed.data } });
  res.status(201).json({ course });
});

coursesRouter.post("/admin/courses/:id/modules", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(1).max(240),
    content: z.string().trim().min(1).max(50000),
    position: z.number().int().min(0).default(0),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid module." });
  const module = await prisma.courseModule.create({ data: { courseId: String(req.params.id), ...parsed.data } });
  res.status(201).json({ module });
});

coursesRouter.post("/admin/courses/:id/resources", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(1).max(240),
    resourceType: z.enum(["SYLLABUS", "CONTENT", "LINK"]),
    externalUrl: z.string().url().nullish(),
    storagePath: z.string().trim().nullish(),
    mimeType: z.string().trim().nullish(),
    sizeBytes: z.number().int().max(25 * 1024 * 1024).nullish(),
  }).refine((v) => !!v.externalUrl !== !!v.storagePath, "Provide either a URL or storage path.").safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid resource." });
  if (parsed.data.mimeType && !["application/pdf", "text/plain"].includes(parsed.data.mimeType)) {
    return res.status(400).json({ error: "Only PDF and plain-text resources are supported." });
  }
  const resource = await prisma.courseResource.create({ data: { courseId: String(req.params.id), ...parsed.data } });
  res.status(201).json({ resource });
});

coursesRouter.post("/admin/upload-url", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({ filename: z.string().trim().min(1), mimeType: z.enum(["application/pdf", "text/plain"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid upload." });
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: "Storage is not configured." });
  const safe = parsed.data.filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${crypto.randomUUID()}/${safe}`;
  const { data, error } = await supabase.storage
    .from(process.env.SUPABASE_COURSE_BUCKET ?? "course-resources")
    .createSignedUploadUrl(path);
  if (error) return res.status(502).json({ error: "Could not prepare upload." });
  res.json({ path, token: data.token, signedUrl: data.signedUrl });
});

coursesRouter.post("/admin/catalogs/:id/grants", requireRole("ADMIN"), async (req, res) => {
  const parsed = z.object({ userId: z.string().uuid().optional(), groupId: z.string().uuid().optional() })
    .refine((v) => !!v.userId !== !!v.groupId, "Choose one user or group.").safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid grant." });
  const catalogId = String(req.params.id);
  const grant = await prisma.catalogGrant.create({ data: { catalogId, ...parsed.data } });
  if (parsed.data.userId) await prisma.notification.create({
    data: {
      userId: parsed.data.userId,
      type: "CATALOG_ACCESS",
      title: "New course catalog available",
      entityType: "CourseCatalog",
      entityId: catalogId,
    },
  });
  res.status(201).json({ grant });
});

coursesRouter.delete("/admin/grants/:id", requireRole("ADMIN"), async (req, res) => {
  const grant = await prisma.catalogGrant.findUnique({ where: { id: String(req.params.id) } });
  if (!grant) return res.status(404).json({ error: "Grant not found." });
  await prisma.catalogGrant.delete({ where: { id: grant.id } });
  res.status(204).end();
});
