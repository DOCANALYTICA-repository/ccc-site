import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import {
  eventInputSchema,
  inviteContactsSchema,
  walkInSchema,
  statusUpdateSchema,
  bulkStatusUpdateSchema,
  invitationDetailSchema,
} from "../lib/schemas.js";

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

// -------------------- Events --------------------

eventsRouter.get("/", async (_req, res) => {
  const events = await prisma.event.findMany({
    orderBy: { startAt: "desc" },
    include: { _count: { select: { invitations: true } } },
  });
  res.json({
    events: events.map((e) => ({ ...e, invitationCount: e._count.invitations, _count: undefined })),
  });
});

eventsRouter.post("/", async (req, res) => {
  const parsed = eventInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const event = await prisma.event.create({
    data: { ...parsed.data, createdBy: req.user!.id },
  });
  await logAudit(req, "event.created", { entityType: "Event", entityId: event.id });
  res.status(201).json({ event });
});

eventsRouter.get("/:id", async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { invitations: true } } },
  });
  if (!event) return res.status(404).json({ error: "Event not found." });

  const statusCounts = await prisma.eventInvitation.groupBy({
    by: ["status"],
    where: { eventId: event.id },
    _count: true,
  });

  res.json({
    event: { ...event, invitationCount: event._count.invitations, _count: undefined },
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
  });
});

eventsRouter.put("/:id", async (req, res) => {
  const parsed = eventInputSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const event = await prisma.event.update({ where: { id: req.params.id }, data: parsed.data });
  await logAudit(req, "event.updated", { entityType: "Event", entityId: event.id, diff: parsed.data });
  res.json({ event });
});

eventsRouter.delete("/:id", async (req, res) => {
  const count = await prisma.eventInvitation.count({ where: { eventId: req.params.id } });
  if (req.query.confirm !== "true") {
    return res.status(409).json({ error: "Confirmation required.", invitationCount: count });
  }
  await prisma.event.delete({ where: { id: req.params.id } });
  await logAudit(req, "event.deleted", { entityType: "Event", entityId: req.params.id, diff: { invitationCount: count } });
  res.status(204).end();
});

// -------------------- Roster --------------------

const invitationInclude = {
  contact: {
    select: {
      id: true,
      fullName: true,
      organization: true,
      designation: true,
      phone: true,
      email: true,
      dietaryNotes: true,
      profileUrl: true,
    },
  },
} as const;

eventsRouter.get("/:id/invitations", async (req, res) => {
  const invitations = await prisma.eventInvitation.findMany({
    where: { eventId: req.params.id },
    include: invitationInclude,
    orderBy: [{ arrivalAt: "asc" }, { createdAt: "asc" }],
  });
  res.json({ invitations });
});

// Select-all-matching-filter bulk invite. Duplicate contactIds against
// contacts already on the roster are silently skipped — the unique
// constraint is the backstop per PLAN.md section 5.4.
eventsRouter.post("/:id/invitations", async (req, res) => {
  const parsed = inviteContactsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const { contactIds, arrivalAt } = parsed.data;

  const existing = await prisma.eventInvitation.findMany({
    where: { eventId: req.params.id, contactId: { in: contactIds } },
    select: { contactId: true },
  });
  const existingIds = new Set(existing.map((e) => e.contactId));
  const toCreate = contactIds.filter((id) => !existingIds.has(id));

  if (toCreate.length > 0) {
    await prisma.eventInvitation.createMany({
      data: toCreate.map((contactId) => ({
        eventId: req.params.id,
        contactId,
        arrivalAt: arrivalAt ?? null,
        addedBy: req.user!.id,
      })),
    });
  }

  await logAudit(req, "invitation.bulk_created", {
    entityType: "Event",
    entityId: req.params.id,
    diff: { requested: contactIds.length, created: toCreate.length, alreadyInvited: existingIds.size },
  });

  res.status(201).json({ created: toCreate.length, alreadyInvited: existingIds.size });
});

eventsRouter.patch("/:id/invitations/:invId", async (req, res) => {
  const parsed = invitationDetailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const invitation = await prisma.eventInvitation.update({
    where: { id: req.params.invId },
    data: parsed.data,
    include: invitationInclude,
  });
  res.json({ invitation });
});

eventsRouter.delete("/:id/invitations/:invId", async (req, res) => {
  await prisma.eventInvitation.delete({ where: { id: req.params.invId } });
  await logAudit(req, "invitation.removed", { entityType: "EventInvitation", entityId: req.params.invId });
  res.status(204).end();
});

// -------------------- Status changes (writes history) --------------------

async function applyStatusChange(invitationId: string, newStatus: string, userId: string) {
  const current = await prisma.eventInvitation.findUniqueOrThrow({ where: { id: invitationId } });

  const updated = await prisma.$transaction(async (tx) => {
    const inv = await tx.eventInvitation.update({
      where: { id: invitationId },
      data: {
        status: newStatus as any,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: userId,
      },
      include: invitationInclude,
    });
    await tx.invitationStatusHistory.create({
      data: {
        invitationId,
        fromStatus: current.status,
        toStatus: newStatus as any,
        changedBy: userId,
      },
    });
    return inv;
  });

  return updated;
}

eventsRouter.patch("/:id/invitations/:invId/status", async (req, res) => {
  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid status." });
  }
  const invitation = await applyStatusChange(req.params.invId, parsed.data.status, req.user!.id);
  res.json({ invitation });
});

eventsRouter.post("/:id/invitations/bulk-status", async (req, res) => {
  const parsed = bulkStatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input." });
  }
  const { invitationIds, status } = parsed.data;

  for (const invId of invitationIds) {
    await applyStatusChange(invId, status, req.user!.id);
  }

  await logAudit(req, "invitation.bulk_status", {
    entityType: "Event",
    entityId: req.params.id,
    diff: { count: invitationIds.length, status },
  });

  res.json({ updated: invitationIds.length });
});

eventsRouter.get("/:id/invitations/:invId/history", async (req, res) => {
  const history = await prisma.invitationStatusHistory.findMany({
    where: { invitationId: req.params.invId },
    include: { changer: { select: { name: true } } },
    orderBy: { changedAt: "desc" },
  });
  res.json({ history });
});

// -------------------- Walk-in registration --------------------

eventsRouter.post("/:id/walk-in", async (req, res) => {
  const parsed = walkInSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input." });
  }

  const eventId = req.params.id;

  const result = await prisma.$transaction(async (tx) => {
    let contactId: string;

    if (parsed.data.mode === "existing") {
      contactId = parsed.data.contactId;
    } else {
      const contact = await tx.contact.create({
        data: {
          fullName: parsed.data.fullName,
          organization: parsed.data.organization ?? null,
          phone: parsed.data.phone ?? null,
          email: parsed.data.email ?? null,
          source: "WALK_IN",
          createdBy: req.user!.id,
        },
      });
      contactId = contact.id;
    }

    const invitation = await tx.eventInvitation.upsert({
      where: { eventId_contactId: { eventId, contactId } },
      create: {
        eventId,
        contactId,
        status: "ARRIVED_IN_CAMPUS",
        statusUpdatedAt: new Date(),
        statusUpdatedBy: req.user!.id,
        addedDuringEvent: true,
        addedBy: req.user!.id,
      },
      update: {
        status: "ARRIVED_IN_CAMPUS",
        statusUpdatedAt: new Date(),
        statusUpdatedBy: req.user!.id,
      },
      include: invitationInclude,
    });

    await tx.invitationStatusHistory.create({
      data: { invitationId: invitation.id, fromStatus: null, toStatus: "ARRIVED_IN_CAMPUS", changedBy: req.user!.id },
    });

    return invitation;
  });

  await logAudit(req, "invitation.walk_in", { entityType: "Event", entityId: eventId, diff: { invitationId: result.id } });
  res.status(201).json({ invitation: result });
});

// -------------------- Roster export --------------------

eventsRouter.get("/:id/export", async (req, res) => {
  const invitations = await prisma.eventInvitation.findMany({
    where: { eventId: req.params.id },
    include: invitationInclude,
    orderBy: [{ arrivalAt: "asc" }],
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Roster");
  ws.columns = [
    { header: "NAME", key: "NAME", width: 24 },
    { header: "COMPANY NAME", key: "COMPANY NAME", width: 22 },
    { header: "POSITION", key: "POSITION", width: 22 },
    { header: "Phone No.", key: "Phone No.", width: 18 },
    { header: "Mail ID", key: "Mail ID", width: 28 },
    { header: "Arrival", key: "Arrival", width: 20 },
    { header: "Status", key: "Status", width: 20 },
    { header: "Food Pref.", key: "Food Pref.", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const inv of invitations) {
    ws.addRow({
      NAME: inv.contact.fullName,
      "COMPANY NAME": inv.contact.organization ?? "",
      POSITION: inv.contact.designation ?? "",
      "Phone No.": inv.contact.phone ?? "",
      "Mail ID": inv.contact.email ?? "",
      Arrival: inv.arrivalAt ? inv.arrivalAt.toISOString() : "",
      Status: inv.status,
      "Food Pref.": inv.contact.dietaryNotes ?? "",
    });
  }

  await logAudit(req, "event.roster_exported", { entityType: "Event", entityId: req.params.id, diff: { count: invitations.length } });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="roster-export.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});
