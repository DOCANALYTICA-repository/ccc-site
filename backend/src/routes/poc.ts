import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { isPocUnlockLocked, recordLoginAttempt, POC_PREFIX } from "../lib/rateLimit.js";
import {
  signAccessToken,
  verifyAccessToken,
  verifyPortalToken,
  verifyPasscode,
} from "../lib/pocSession.js";

/** The student point-of-contact check-in portal.
 *
 * Deliberately outside the session-cookie world: POCs are volunteers on the
 * gate, not account holders, and handing every one of them a login would mean
 * provisioning and deprovisioning accounts around a single evening. Instead
 * they hold a scoped token that can do exactly two things — read one event's
 * roster and move a guest to ARRIVED_IN_CAMPUS — and nothing else in the app.
 *
 * Everything written here lands in the same tables the staff roster reads, so
 * an arrival marked at the gate shows up in the main application immediately.
 */
export const pocRouter = Router();

interface PocContext {
  sessionId: string;
  eventId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      poc?: PocContext;
    }
  }
}

/** Re-reads the session row on every request rather than trusting the token
 * alone, so "End session" in the admin UI takes effect immediately even for a
 * POC whose 12-hour access token is still cryptographically valid. */
async function loadLiveSession(ctx: PocContext) {
  const session = await prisma.eventCheckInSession.findFirst({
    where: { id: ctx.sessionId, eventId: ctx.eventId, mode: "POC_PORTAL", isActive: true },
    include: { event: { select: { id: true, name: true, venue: true, startAt: true, status: true } } },
  });
  if (!session) return null;
  if (session.expiresAt && session.expiresAt.getTime() < Date.now()) return null;
  if (session.event.status === "CANCELLED") return null;
  return session;
}

async function requirePoc(req: Request, res: Response, next: NextFunction) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: "This check-in session is no longer open. Scan the QR again." });
  }
  const session = await loadLiveSession(payload);
  if (!session) {
    return res.status(401).json({ error: "This check-in session has ended. Ask a staff member for a new QR." });
  }
  req.poc = payload;
  next();
}

// -------------------- Unlock --------------------

/** Exchanges the QR's portal token plus the shared passcode for a scoped
 * access token. A six-digit passcode is only safe behind a lockout, and that
 * lockout is scoped to the session rather than the caller's address — see
 * isPocUnlockLocked for why an IP-scoped one would take the venue down. */
pocRouter.post("/unlock", async (req, res) => {
  const parsed = z
    .object({ token: z.string().min(1), passcode: z.string().trim().min(1).max(24) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the check-in passcode." });

  const payload = verifyPortalToken(parsed.data.token);
  if (!payload) {
    return res.status(400).json({ error: "This QR code is no longer valid. Ask a staff member for the current one." });
  }

  const ip = req.ip ?? "unknown";
  const throttleKey = POC_PREFIX + payload.sessionId;
  if (await isPocUnlockLocked(payload.sessionId)) {
    return res.status(429).json({ error: "Too many incorrect passcodes. Try again in 15 minutes." });
  }

  const session = await loadLiveSession(payload);
  if (!session || !session.passcodeHash) {
    return res.status(400).json({ error: "This check-in session has ended. Ask a staff member for a new QR." });
  }

  if (!(await verifyPasscode(session.passcodeHash, parsed.data.passcode))) {
    await recordLoginAttempt(throttleKey, ip, false);
    return res.status(401).json({ error: "That passcode is incorrect." });
  }
  await recordLoginAttempt(throttleKey, ip, true);

  res.json({
    accessToken: signAccessToken(payload),
    event: { name: session.event.name, venue: session.event.venue, startAt: session.event.startAt },
  });
});

// -------------------- Roster --------------------

pocRouter.use(requirePoc);

/** Only what a POC needs to find a person at the gate and confirm it's them.
 * No phone numbers, no emails, no dietary notes — the portal is unlocked by a
 * shared passcode, so it must never become a way to walk off with the
 * contact details of every guest at the event. */
const rosterSelect = {
  id: true,
  status: true,
  contact: { select: { fullName: true, organization: true, designation: true } },
} as const;

pocRouter.get("/roster", async (req, res) => {
  const invitations = await prisma.eventInvitation.findMany({
    where: { eventId: req.poc!.eventId },
    select: rosterSelect,
    orderBy: { contact: { fullName: "asc" } },
  });
  const arrived = invitations.filter((i) => i.status === "ARRIVED_IN_CAMPUS").length;
  res.json({ invitations, counts: { total: invitations.length, arrived } });
});

// -------------------- Mark attendance --------------------

/** ARRIVED_IN_CAMPUS is the only status a POC can set, plus a way back out of
 * it: a mis-tap on a crowded gate list needs an undo, and the alternative is
 * a guest silently recorded as present who never came. Reverting lands on
 * CONFIRMED because a guest standing at the gate has, by arriving, confirmed. */
const markSchema = z.object({
  invitationId: z.string().uuid(),
  status: z.enum(["ARRIVED_IN_CAMPUS", "CONFIRMED"]).default("ARRIVED_IN_CAMPUS"),
});

pocRouter.post("/check-in", async (req, res) => {
  const parsed = markSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid check-in request." });

  const invitation = await prisma.eventInvitation.findFirst({
    where: { id: parsed.data.invitationId, eventId: req.poc!.eventId },
  });
  if (!invitation) return res.status(404).json({ error: "That guest is not on this event's list." });

  // CONFIRMED is reachable only as the undo of an arrival this portal just
  // recorded. Without this, a portal token could overwrite the RSVP of a guest
  // who explicitly declined — well outside "mark who walked through the door".
  if (parsed.data.status === "CONFIRMED" && invitation.status !== "ARRIVED_IN_CAMPUS") {
    return res.status(409).json({ error: "Only a guest marked as arrived can be undone." });
  }

  if (invitation.status === parsed.data.status) {
    const current = await prisma.eventInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
      select: rosterSelect,
    });
    return res.json({ invitation: current, alreadySet: true });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.eventInvitation.update({
      where: { id: invitation.id },
      data: {
        status: parsed.data.status,
        statusUpdatedAt: new Date(),
        // Left null on purpose: no signed-in user made this change, and
        // attributing it to the admin who started the session would be a lie.
        // The history row below records that it came from the portal.
        statusUpdatedBy: null,
      },
      select: rosterSelect,
    });
    await tx.invitationStatusHistory.create({
      data: {
        invitationId: invitation.id,
        fromStatus: invitation.status,
        toStatus: parsed.data.status,
        changedBy: null,
        source: "POC_PORTAL",
      },
    });
    return value;
  });

  await logAudit(req, "invitation.poc_status", {
    entityType: "EventInvitation",
    entityId: invitation.id,
    diff: { from: invitation.status, to: parsed.data.status, sessionId: req.poc!.sessionId },
  });

  res.json({ invitation: updated, alreadySet: false });
});
