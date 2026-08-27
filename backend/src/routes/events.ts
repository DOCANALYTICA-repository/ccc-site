import { Router } from "express";
import ExcelJS from "exceljs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireInternal } from "../middleware/auth.js";
import { ensureGuestAccount } from "../lib/provision.js";
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
eventsRouter.use(requireAuth, requireInternal);

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

  const provisioning: Record<string, string> = {};
  if (toCreate.length > 0) await prisma.$transaction(async (tx) => {
    for (const contactId of toCreate) {
      const invitation = await tx.eventInvitation.create({
        data: { eventId: req.params.id, contactId, arrivalAt: arrivalAt ?? null, addedBy: req.user!.id },
        include: { event: { select: { name: true } } },
      });
      const account = await ensureGuestAccount(tx, contactId);
      provisioning[contactId] = account.status;
      if ("user" in account && account.user) {
        await tx.notification.create({
          data: {
            userId: account.user.id,
            type: "EVENT_INVITATION",
            title: `You're invited to ${invitation.event.name}`,
            entityType: "EventInvitation",
            entityId: invitation.id,
          },
        });
      }
    }
  });

  await logAudit(req, "invitation.bulk_created", {
    entityType: "Event",
    entityId: req.params.id,
    diff: { requested: contactIds.length, created: toCreate.length, alreadyInvited: existingIds.size },
  });

  res.status(201).json({ created: toCreate.length, alreadyInvited: existingIds.size, provisioning });
});

eventsRouter.patch("/:id/invitations/:invId", async (req, res) => {
  const parsed = invitationDetailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const owned = await prisma.eventInvitation.findFirst({ where: { id: req.params.invId, eventId: req.params.id } });
  if (!owned) return res.status(404).json({ error: "Invitation not found." });
  const invitation = await prisma.eventInvitation.update({
    where: { id: req.params.invId },
    data: parsed.data,
    include: invitationInclude,
  });
  res.json({ invitation });
});

eventsRouter.delete("/:id/invitations/:invId", async (req, res) => {
  const deleted = await prisma.eventInvitation.deleteMany({ where: { id: req.params.invId, eventId: req.params.id } });
  if (!deleted.count) return res.status(404).json({ error: "Invitation not found." });
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
  const owned = await prisma.eventInvitation.findFirst({ where: { id: req.params.invId, eventId: req.params.id } });
  if (!owned) return res.status(404).json({ error: "Invitation not found." });
  const invitation = await applyStatusChange(req.params.invId, parsed.data.status, req.user!.id);
  res.json({ invitation });
});

eventsRouter.post("/:id/check-in-session", async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) return res.status(404).json({ error: "Event not found." });
  const session = await prisma.$transaction(async (tx) => {
    await tx.eventCheckInSession.updateMany({
      where: { eventId: event.id, isActive: true },
      data: { isActive: false, endedAt: new Date() },
    });
    return tx.eventCheckInSession.create({
      data: { eventId: event.id, startedBy: req.user!.id },
    });
  });
  res.status(201).json({ session });
});

eventsRouter.get("/:id/check-in-token", async (req, res) => {
  const session = await prisma.eventCheckInSession.findFirst({
    where: { eventId: req.params.id, isActive: true },
    orderBy: { startedAt: "desc" },
  });
  if (!session) return res.status(404).json({ error: "No active check-in session." });
  const secret = process.env.CHECKIN_SECRET ?? process.env.AUTH_SECRET!;
  const token = jwt.sign({ eventId: req.params.id, sessionId: session.id, nonce: crypto.randomUUID() }, secret, { expiresIn: "60s" });
  res.json({ token, expiresAt: new Date(Date.now() + 60_000) });
});

eventsRouter.delete("/:id/check-in-session", async (req, res) => {
  await prisma.eventCheckInSession.updateMany({
    where: { eventId: req.params.id, isActive: true },
    data: { isActive: false, endedAt: new Date() },
  });
  res.status(204).end();
});

eventsRouter.post("/:id/invitations/bulk-status", async (req, res) => {
  const parsed = bulkStatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input." });
  }
  const { invitationIds, status } = parsed.data;
  const owned = await prisma.eventInvitation.count({ where: { id: { in: invitationIds }, eventId: req.params.id } });
  if (owned !== invitationIds.length) return res.status(400).json({ error: "One or more invitations do not belong to this event." });

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

  const account = await ensureGuestAccount(prisma, result.contactId);
  if ("user" in account && account.user) {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { name: true } });
    await prisma.notification.create({
      data: {
        userId: account.user.id,
        type: "EVENT_INVITATION",
        title: `You're registered for ${event?.name ?? "a CCC event"}`,
        entityType: "EventInvitation",
        entityId: result.id,
      },
    });
  }

  await logAudit(req, "invitation.walk_in", { entityType: "Event", entityId: eventId, diff: { invitationId: result.id } });
  res.status(201).json({ invitation: result, provisioning: account.status });
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

// A deliberately separate onboarding export: the general roster must never
// imply that every guest still uses the bootstrap credential.
eventsRouter.get("/:id/onboarding.csv", async (req, res) => {
  const invitations = await prisma.eventInvitation.findMany({
    where: { eventId: req.params.id },
    include: { contact: { include: { account: { select: { phone: true, mustChangePassword: true, isActive: true } } } } },
    orderBy: { contact: { fullName: "asc" } },
  });
  const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["Guest", "Phone login", "Onboarding state", "Bootstrap instruction"],
    ...invitations.map(({ contact }) => {
      const account = contact.account;
      const state = !contact.phone ? "Account setup needed" : !account ? "Phone conflict or setup needed" : !account.isActive ? "Account disabled" : account.mustChangePassword ? "Password change required" : "Onboarded";
      const instruction = account?.mustChangePassword ? "Sign in with this phone and temporary password 1234, then choose a private password." : "";
      return [contact.fullName, account?.phone ?? contact.phone ?? "", state, instruction];
    }),
  ];
  await logAudit(req, "event.onboarding_exported", { entityType: "Event", entityId: req.params.id, diff: { count: invitations.length } });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="guest-onboarding.csv"');
  res.send(`\uFEFF${rows.map((row) => row.map(quote).join(",")).join("\n")}`);
});
