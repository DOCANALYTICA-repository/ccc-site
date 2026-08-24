import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { contactInputSchema } from "../lib/schemas.js";
import { logAudit } from "../lib/audit.js";

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

const contactSelect = {
  id: true,
  fullName: true,
  organization: true,
  designation: true,
  profileUrl: true,
  email: true,
  altEmail: true,
  phone: true,
  altPhone: true,
  dietaryNotes: true,
  notes: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: { id: true, name: true } } } },
} as const;

function shapeContact(c: any) {
  return { ...c, tags: c.tags.map((t: any) => t.tag) };
}

// Whole directory at once — see PLAN.md section 1: under 100 rows, client-side
// search beats round-tripping the server on every keystroke.
contactsRouter.get("/", async (_req, res) => {
  const contacts = await prisma.contact.findMany({
    where: { deletedAt: null },
    select: contactSelect,
    orderBy: { fullName: "asc" },
  });
  res.json({ contacts: contacts.map(shapeContact) });
});

// Registered before "/:id" — Express matches route order, and a single
// path segment would otherwise be swallowed as :id="export".
contactsRouter.get("/export", async (req, res) => {
  const idsParam = typeof req.query.ids === "string" ? req.query.ids : undefined;
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;
  const contacts = await prisma.contact.findMany({
    where: { deletedAt: null, ...(ids && ids.length > 0 ? { id: { in: ids } } : {}) },
    orderBy: { fullName: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contacts");
  ws.columns = [
    { header: "NAME", key: "NAME", width: 24 },
    { header: "COMPANY NAME", key: "COMPANY NAME", width: 22 },
    { header: "POSITION", key: "POSITION", width: 22 },
    { header: "Profile", key: "Profile", width: 36 },
    { header: "Phone No.", key: "Phone No.", width: 18 },
    { header: "Mail ID", key: "Mail ID", width: 28 },
    { header: "Food Pref.", key: "Food Pref.", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const c of contacts) {
    ws.addRow({
      NAME: c.fullName,
      "COMPANY NAME": c.organization ?? "",
      POSITION: c.designation ?? "",
      Profile: c.profileUrl ?? "",
      "Phone No.": c.phone ?? "",
      "Mail ID": c.email ?? "",
      "Food Pref.": c.dietaryNotes ?? "",
    });
  }

  await logAudit(req, "contact.exported", { diff: { count: contacts.length } });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="contacts-export.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

contactsRouter.get("/:id", async (req, res) => {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
    select: contactSelect,
  });
  if (!contact) return res.status(404).json({ error: "Contact not found." });
  res.json({ contact: shapeContact(contact) });
});

/** Never blocks — surfaces matches so the caller can warn and let the user
 * decide. See PLAN.md section 5.1. */
async function findDuplicateWarnings(input: { email?: string | null; phone?: string | null; fullName: string; organization?: string | null }, excludeId?: string) {
  const matches: { field: string; contactId: string; contactName: string }[] = [];

  if (input.email) {
    const m = await prisma.contact.findFirst({
      where: { email: { equals: input.email, mode: "insensitive" }, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, fullName: true },
    });
    if (m) matches.push({ field: "email", contactId: m.id, contactName: m.fullName });
  }
  if (input.phone) {
    const m = await prisma.contact.findFirst({
      where: { phone: input.phone, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, fullName: true },
    });
    if (m) matches.push({ field: "phone", contactId: m.id, contactName: m.fullName });
  }
  if (input.organization) {
    const m = await prisma.contact.findFirst({
      where: {
        fullName: { equals: input.fullName, mode: "insensitive" },
        organization: { equals: input.organization, mode: "insensitive" },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, fullName: true },
    });
    if (m) matches.push({ field: "name+organization", contactId: m.id, contactName: m.fullName });
  }
  return matches;
}

contactsRouter.post("/", async (req, res) => {
  const parsed = contactInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const { tags, ...data } = parsed.data;

  const warnings = await findDuplicateWarnings(data);

  const contact = await prisma.contact.create({
    data: {
      fullName: data.fullName,
      organization: data.organization ?? null,
      designation: data.designation ?? null,
      profileUrl: data.profileUrl ?? null,
      email: data.email ?? null,
      altEmail: data.altEmail ?? null,
      phone: data.phone ?? null,
      altPhone: data.altPhone ?? null,
      dietaryNotes: data.dietaryNotes ?? null,
      notes: data.notes ?? null,
      source: "MANUAL",
      createdBy: req.user!.id,
      ...(tags && tags.length > 0
        ? {
            tags: {
              create: tags.map((name) => ({
                tag: { connectOrCreate: { where: { name }, create: { name } } },
              })),
            },
          }
        : {}),
    },
    select: contactSelect,
  });

  await logAudit(req, "contact.created", { entityType: "Contact", entityId: contact.id });
  res.status(201).json({ contact: shapeContact(contact), warnings });
});

contactsRouter.put("/:id", async (req, res) => {
  const parsed = contactInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const { tags, ...data } = parsed.data;

  const existing = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: "Contact not found." });

  const warnings = await findDuplicateWarnings(data, req.params.id);

  const contact = await prisma.$transaction(async (tx) => {
    if (tags) {
      await tx.contactTag.deleteMany({ where: { contactId: req.params.id } });
    }
    return tx.contact.update({
      where: { id: req.params.id },
      data: {
        fullName: data.fullName,
        organization: data.organization ?? null,
        designation: data.designation ?? null,
        profileUrl: data.profileUrl ?? null,
        email: data.email ?? null,
        altEmail: data.altEmail ?? null,
        phone: data.phone ?? null,
        altPhone: data.altPhone ?? null,
        dietaryNotes: data.dietaryNotes ?? null,
        notes: data.notes ?? null,
        ...(tags && tags.length > 0
          ? {
              tags: {
                create: tags.map((name) => ({
                  tag: { connectOrCreate: { where: { name }, create: { name } } },
                })),
              },
            }
          : {}),
      },
      select: contactSelect,
    });
  });

  await logAudit(req, "contact.updated", { entityType: "Contact", entityId: contact.id, diff: data });
  res.json({ contact: shapeContact(contact), warnings });
});

contactsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: "Contact not found." });

  await prisma.contact.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  await logAudit(req, "contact.deleted", { entityType: "Contact", entityId: req.params.id });
  res.status(204).end();
});
