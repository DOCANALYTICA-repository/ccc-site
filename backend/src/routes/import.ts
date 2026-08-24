import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import { commitImportSchema, type ImportRow } from "../lib/schemas.js";

export const importRouter = Router();
importRouter.use(requireAuth);

// Blank template with the exact seven headers the real guest-list export
// uses — see PLAN.md section 3. Downloadable from the import screen.
importRouter.get("/template", async (_req, res) => {
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
  ws.addRow({
    NAME: "Jane Doe",
    "COMPANY NAME": "Acme Corp",
    POSITION: "Director",
    Profile: "https://www.linkedin.com/in/janedoe",
    "Phone No.": "9876543210",
    "Mail ID": "jane@acme.com",
    "Food Pref.": "Vegetarian",
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="ccc-contact-import-template.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

interface RowError {
  rowIndex: number;
  fullName: string | null;
  reason: string;
}

// Server-side dedupe cascade: email -> phone -> lower(name)+lower(org).
// See PLAN.md section 5.2 — 40% of the real data has no phone, 4% no
// email, so the name+org tier does real work and always needs the
// strategy the user picked, never a silent merge.
async function findExistingMatch(row: ImportRow) {
  if (row.email) {
    const m = await prisma.contact.findFirst({
      where: { email: { equals: row.email, mode: "insensitive" }, deletedAt: null },
    });
    if (m) return m;
  }
  if (row.phone) {
    const m = await prisma.contact.findFirst({ where: { phone: row.phone, deletedAt: null } });
    if (m) return m;
  }
  if (row.fullName && row.organization) {
    const m = await prisma.contact.findFirst({
      where: {
        fullName: { equals: row.fullName, mode: "insensitive" },
        organization: { equals: row.organization, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (m) return m;
  }
  return null;
}

importRouter.post("/commit", async (req, res) => {
  const parsed = commitImportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const { filename, rows, duplicateStrategy, inviteToEventId } = parsed.data;

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: RowError[] = [];
  const resultContactIds: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowIndex = row.rowIndex ?? i;

    if (!row.fullName || row.fullName.trim() === "") {
      errors.push({ rowIndex, fullName: null, reason: "Missing name — the only required field." });
      continue;
    }

    const existing = await findExistingMatch(row);

    if (existing) {
      if (duplicateStrategy === "SKIP") {
        skipped++;
        resultContactIds.push(existing.id);
        continue;
      }
      if (duplicateStrategy === "UPDATE") {
        const updatedContact = await prisma.contact.update({
          where: { id: existing.id },
          data: {
            fullName: row.fullName,
            organization: row.organization ?? existing.organization,
            designation: row.designation ?? existing.designation,
            profileUrl: row.profileUrl ?? existing.profileUrl,
            email: row.email ?? existing.email,
            altEmail: row.altEmail ?? existing.altEmail,
            phone: row.phone ?? existing.phone,
            altPhone: row.altPhone ?? existing.altPhone,
            phoneRaw: row.phoneRaw ?? existing.phoneRaw,
            dietaryNotes: row.dietaryNotes ?? existing.dietaryNotes,
          },
        });
        updated++;
        resultContactIds.push(updatedContact.id);
        continue;
      }
      // CREATE_ANYWAY falls through to creation below.
    }

    try {
      const contact = await prisma.contact.create({
        data: {
          fullName: row.fullName,
          organization: row.organization,
          designation: row.designation,
          profileUrl: row.profileUrl,
          email: row.email,
          altEmail: row.altEmail,
          phone: row.phone,
          altPhone: row.altPhone,
          phoneRaw: row.phoneRaw,
          dietaryNotes: row.dietaryNotes,
          source: "IMPORT",
          createdBy: req.user!.id,
        },
      });
      created++;
      resultContactIds.push(contact.id);
    } catch (err) {
      errors.push({ rowIndex, fullName: row.fullName, reason: "Could not save this row." });
    }
  }

  let invitedCount = 0;
  if (inviteToEventId && resultContactIds.length > 0) {
    const existingInvites = await prisma.eventInvitation.findMany({
      where: { eventId: inviteToEventId, contactId: { in: resultContactIds } },
      select: { contactId: true },
    });
    const already = new Set(existingInvites.map((e) => e.contactId));
    const toInvite = resultContactIds.filter((id) => !already.has(id));
    if (toInvite.length > 0) {
      await prisma.eventInvitation.createMany({
        data: toInvite.map((contactId) => ({ eventId: inviteToEventId, contactId, addedBy: req.user!.id })),
      });
      invitedCount = toInvite.length;
    }
  }

  const batch = await prisma.importBatch.create({
    data: {
      filename,
      uploadedBy: req.user!.id,
      eventId: inviteToEventId ?? null,
      totalRows: rows.length,
      createdCount: created,
      updatedCount: updated,
      skippedCount: skipped,
      errorCount: errors.length,
      errors: errors.length > 0 ? (errors as unknown as object[]) : undefined,
    },
  });

  await logAudit(req, "import.committed", {
    entityType: "ImportBatch",
    entityId: batch.id,
    diff: { created, updated, skipped, errors: errors.length, invited: invitedCount },
  });

  res.status(201).json({
    batchId: batch.id,
    created,
    updated,
    skipped,
    failed: errors.length,
    invited: invitedCount,
    errors,
  });
});

// Downloads only the failed rows from a prior commit, with a reason column,
// so the user can fix and re-upload that file directly.
importRouter.get("/batches/:id/errors.xlsx", async (req, res) => {
  const batch = await prisma.importBatch.findUnique({ where: { id: req.params.id } });
  if (!batch) return res.status(404).json({ error: "Import batch not found." });

  const errors = (batch.errors as RowError[] | null) ?? [];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Errors");
  ws.columns = [
    { header: "Row", key: "Row", width: 8 },
    { header: "NAME", key: "NAME", width: 24 },
    { header: "Reason", key: "Reason", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const e of errors) {
    ws.addRow({ Row: e.rowIndex + 1, NAME: e.fullName ?? "", Reason: e.reason });
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="import-errors.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});
