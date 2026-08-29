import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { trustedOrigins } from "../middleware/security.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

export const coursesRouter = Router();

/** Resources whose storagePath starts with this prefix live in the repo under
 * backend/assets rather than in Supabase Storage. The Commerce syllabi are a
 * fixed set of department-wide PDFs that ship with the deployment, so binding
 * them to a storage bucket — and to that bucket's credentials being present —
 * would buy nothing. Uploads still go to Supabase. */
const LOCAL_PREFIX = "local:";

/** Where backend/assets ends up depends on who built us: tsc emits to
 * dist/src/routes, `tsx` runs straight from src/routes, and Vercel bundles the
 * function somewhere else again with the directory copied in via the
 * includeFiles rule in vercel.json. Rather than guess, probe the candidates
 * once at module load. */
const ASSETS_ROOT = (() => {
  const here = __dirname;
  const candidates = [
    path.resolve(here, "../../assets"), // src/routes/… (tsx, dev)
    path.resolve(here, "../../../assets"), // dist/src/routes/… (tsc build)
    path.resolve(process.cwd(), "assets"), // Vercel: includeFiles, cwd at root
    path.resolve(process.cwd(), "backend/assets"), // cwd at repo root
  ];
  return candidates.find((dir) => fs.existsSync(dir)) ?? candidates[0]!;
})();

/** A catalog is readable if it is department-wide (isPublic) or explicitly
 * granted to this account, directly or through an access group. */
const catalogAccessWhere = (userId: string) => ({
  OR: [
    { isPublic: true },
    {
      grants: {
        some: {
          OR: [
            { userId },
            { group: { members: { some: { userId } } } },
          ],
        },
      },
    },
  ],
});

// -------------------- Locally-hosted resource files --------------------

/** Served from a short-lived signed URL rather than the session cookie so the
 * PDF can be rendered in an <iframe> on the frontend's own domain: the API is
 * a different origin in production, and third-party cookies are exactly what
 * browsers are busy taking away. The token is minted only after the caller's
 * access to the catalog has been checked. */
const FILE_TOKEN_TTL_SECONDS = 15 * 60;

function fileSecret() {
  const value = process.env.CHECKIN_SECRET ?? process.env.AUTH_SECRET;
  if (!value) throw new Error("CHECKIN_SECRET or AUTH_SECRET env var is required");
  return value;
}

function signFileToken(resourceId: string) {
  return jwt.sign({ resourceId, kind: "course-file" }, fileSecret(), { expiresIn: FILE_TOKEN_TTL_SECONDS });
}

// Registered before requireAuth: the signed token is the credential here.
coursesRouter.get("/file", async (req, res) => {
  let resourceId: string;
  try {
    const decoded = jwt.verify(String(req.query.t ?? ""), fileSecret());
    if (typeof decoded === "string" || decoded.kind !== "course-file" || typeof decoded.resourceId !== "string") {
      throw new Error("bad token");
    }
    resourceId = decoded.resourceId;
  } catch {
    return res.status(401).json({ error: "This link has expired. Reopen the syllabus." });
  }

  const resource = await prisma.courseResource.findUnique({ where: { id: resourceId } });
  if (!resource?.storagePath?.startsWith(LOCAL_PREFIX)) {
    return res.status(404).json({ error: "Resource file is missing." });
  }

  // The path came out of a signed token, but resolve-and-contain anyway: a
  // stored path is data, and one traversal bug here reads the whole disk.
  const absolute = path.resolve(ASSETS_ROOT, resource.storagePath.slice(LOCAL_PREFIX.length));
  if (!absolute.startsWith(ASSETS_ROOT + path.sep) || !fs.existsSync(absolute)) {
    return res.status(404).json({ error: "Resource file is missing." });
  }

  // Helmet's app-wide X-Frame-Options and default-src 'none' would both block
  // the frontend from embedding this: the first forbids the frame outright,
  // and the second starves the browser's built-in PDF viewer of the resources
  // it renders itself with, leaving a blank pane. frame-ancestors is the whole
  // policy this response needs. 'self' comes first because the frontend is
  // served from this same deployment now, so the embedding page and this file
  // share an origin; FRONTEND_ORIGIN still covers a separately hosted frontend.
  res.removeHeader("X-Frame-Options");
  res.setHeader(
    "Content-Security-Policy",
    `frame-ancestors 'self' ${trustedOrigins().join(" ")}`,
  );
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Type", resource.mimeType ?? "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${resource.title.replace(/[^a-zA-Z0-9 ._-]/g, "")}.pdf"`);
  res.setHeader("Cache-Control", "private, max-age=900");
  fs.createReadStream(absolute).pipe(res);
});

coursesRouter.use(requireAuth);

coursesRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const internal = ["ADMIN", "STAFF"].includes(req.user!.role);
  const catalogs = await prisma.courseCatalog.findMany({
    where: {
      ...(internal ? {} : { status: "PUBLISHED" as const, AND: [catalogAccessWhere(req.user!.id)] }),
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
      ...(internal ? {} : { status: "PUBLISHED" as const, AND: [catalogAccessWhere(req.user!.id)] }),
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
      where: { AND: [{ id: resource.course.catalogId, status: "PUBLISHED" }, catalogAccessWhere(req.user!.id)] },
    });
    if (!allowed) return res.status(403).json({ error: "Not permitted." });
  }
  if (resource.externalUrl) return res.json({ url: resource.externalUrl, external: true });
  if (!resource.storagePath) return res.status(404).json({ error: "Resource file is missing." });
  if (resource.storagePath.startsWith(LOCAL_PREFIX)) {
    // The public path, not req.baseUrl: the browser must always be sent to
    // /api/courses, because that is the only prefix routed to this service.
    const base = `${req.protocol}://${req.get("host")}/api/courses`;
    return res.json({ url: `${base}/file?t=${encodeURIComponent(signFileToken(resource.id))}`, expiresIn: FILE_TOKEN_TTL_SECONDS });
  }
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
    isPublic: z.boolean().optional(),
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
