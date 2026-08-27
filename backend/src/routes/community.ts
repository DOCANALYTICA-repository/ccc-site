import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const communityRouter = Router();
communityRouter.use(requireAuth);

communityRouter.get("/home", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { contact: true, profile: true },
  });
  const invitations = user?.contactId
    ? await prisma.eventInvitation.findMany({
        where: { contactId: user.contactId },
        include: {
          event: { include: { survey: { select: { id: true, status: true, title: true } } } },
          surveyResponse: { select: { id: true, updatedAt: true } },
        },
        orderBy: { event: { startAt: "desc" } },
      })
    : [];
  const [unreadNotifications, unreadMessages, catalogCount] = await Promise.all([
    prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    prisma.message.count({
      where: {
        conversation: { participants: { some: { userId: req.user!.id } } },
        senderId: { not: req.user!.id },
        createdAt: {
          gt: (await prisma.conversationParticipant.findFirst({
            where: { userId: req.user!.id },
            orderBy: { lastReadAt: "asc" },
            select: { lastReadAt: true },
          }))?.lastReadAt ?? new Date(0),
        },
      },
    }),
    prisma.courseCatalog.count({
      where: {
        status: "PUBLISHED",
        grants: {
          some: {
            OR: [
              { userId: req.user!.id },
              { group: { members: { some: { userId: req.user!.id } } } },
            ],
          },
        },
      },
    }),
  ]);
  res.json({ user: req.user, profile: user?.profile, invitations, unreadNotifications, unreadMessages, catalogCount });
});

communityRouter.patch("/invitations/:id/respond", requireRole("GUEST"), async (req, res) => {
  const parsed = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid response." });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.contactId) return res.status(403).json({ error: "No guest record is linked to this account." });
  const invitation = await prisma.eventInvitation.findFirst({
    where: { id: String(req.params.id), contactId: user.contactId },
  });
  if (!invitation) return res.status(404).json({ error: "Invitation not found." });
  if (["ARRIVED_IN_CAMPUS"].includes(invitation.status)) {
    return res.status(409).json({ error: "Attendance has already been recorded." });
  }
  const next = parsed.data.decision === "ACCEPT" ? "CONFIRMED" : "DECLINED";
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.eventInvitation.update({
      where: { id: invitation.id },
      data: {
        status: next,
        respondedAt: new Date(),
        statusUpdatedAt: new Date(),
        statusUpdatedBy: req.user!.id,
      },
      include: { event: true },
    });
    await tx.invitationStatusHistory.create({
      data: { invitationId: invitation.id, fromStatus: invitation.status, toStatus: next, changedBy: req.user!.id },
    });
    return value;
  });
  res.json({ invitation: updated });
});

communityRouter.post("/check-in", requireRole("GUEST"), async (req, res) => {
  const parsed = z.object({ token: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A check-in token is required." });
  let payload: { eventId: string; sessionId: string };
  try {
    payload = jwt.verify(parsed.data.token, process.env.CHECKIN_SECRET ?? process.env.AUTH_SECRET!) as typeof payload;
  } catch {
    return res.status(400).json({ error: "This QR code has expired. Scan the current code." });
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.contactId) return res.status(403).json({ error: "No guest record is linked." });
  const [session, invitation] = await Promise.all([
    prisma.eventCheckInSession.findFirst({
      where: { id: payload.sessionId, eventId: payload.eventId, isActive: true },
      include: { event: true },
    }),
    prisma.eventInvitation.findUnique({
      where: { eventId_contactId: { eventId: payload.eventId, contactId: user.contactId } },
    }),
  ]);
  if (!session || session.event.status === "CANCELLED") return res.status(400).json({ error: "Check-in is not active." });
  if (!invitation) return res.status(403).json({ error: "You are not invited to this event." });
  if (invitation.status === "ARRIVED_IN_CAMPUS") return res.json({ invitation, alreadyCheckedIn: true });
  if (invitation.status !== "CONFIRMED") return res.status(409).json({ error: "Accept the invitation before checking in." });

  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.eventInvitation.update({
      where: { id: invitation.id },
      data: { status: "ARRIVED_IN_CAMPUS", statusUpdatedAt: new Date(), statusUpdatedBy: req.user!.id },
    });
    await tx.invitationStatusHistory.create({
      data: { invitationId: invitation.id, fromStatus: invitation.status, toStatus: "ARRIVED_IN_CAMPUS", changedBy: req.user!.id },
    });
    const survey = await tx.eventSurvey.findUnique({ where: { eventId: payload.eventId } });
    if (survey?.status === "OPEN") {
      await tx.notification.create({
        data: {
          userId: req.user!.id,
          type: "SURVEY_OPENED",
          title: survey.title,
          body: "The event questionnaire is ready.",
          entityType: "EventSurvey",
          entityId: survey.id,
        },
      });
    }
    return value;
  });
  res.json({ invitation: updated, alreadyCheckedIn: false });
});
