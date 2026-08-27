import { Router } from "express";
import jwt from "jsonwebtoken";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { prisma } from "../lib/prisma.js";
import {
  signSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
  SESSION_COOKIE_OPTS,
  hashPassword,
  verifyPassword,
  generateInviteToken,
  hashInviteToken,
  isPasswordStrongEnough,
} from "../lib/auth.js";
import { isLoginLocked, recordLoginAttempt } from "../lib/rateLimit.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { loginSchema, createInviteSchema, acceptInviteSchema, changePasswordSchema } from "../lib/schemas.js";
import { logAudit } from "../lib/audit.js";

export const authRouter = Router();

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

const cookieOpts = { ...SESSION_COOKIE_OPTS, maxAge: SESSION_COOKIE_MAX_AGE_MS };

function normalizeIdentifier(value: string) {
  const clean = value.trim();
  if (clean.includes("@")) return clean.toLowerCase();
  try {
    return parsePhoneNumberWithError(clean, (process.env.DEFAULT_PHONE_REGION ?? "IN") as "IN").number;
  } catch {
    return clean.replace(/[\s()-]/g, "");
  }
}

function shapeUser(user: {
  id: string; email: string | null; phone: string | null; name: string;
  role: "ADMIN" | "STAFF" | "MEMBER" | "GUEST"; mustChangePassword: boolean;
}) {
  return {
    id: user.id, email: user.email, phone: user.phone, name: user.name,
    role: user.role, mustChangePassword: user.mustChangePassword,
  };
}

// -------------------- Login / logout / me --------------------

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input." });
  }
  const { identifier: rawIdentifier, password } = parsed.data;
  const identifier = normalizeIdentifier(rawIdentifier);
  const ip = req.ip ?? "unknown";

  if (await isLoginLocked(identifier, ip)) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }

  const user = await prisma.user.findFirst({
    where: identifier.includes("@") ? { email: identifier } : { phone: identifier },
  });

  // Generic failure message throughout — no user-enumeration leak.
  const genericFail = async () => {
    await recordLoginAttempt(identifier, ip, false);
    return res.status(401).json({ error: "Invalid credentials." });
  };

  if (!user || !user.isActive || !user.passwordHash) return genericFail();

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) return genericFail();

  await recordLoginAttempt(identifier, ip, true);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    prisma.networkProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        displayName: user.name,
        organization: ["ADMIN", "STAFF", "MEMBER"].includes(user.role) ? "CHRIST University" : null,
        discoverable: user.role !== "GUEST",
      },
      update: {},
    }),
  ]);

  const token = signSession({ sub: user.id, tokenVersion: user.tokenVersion });
  res.cookie(SESSION_COOKIE_NAME, token, cookieOpts);
  return res.json({
    user: shapeUser(user),
  });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTS);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });
  const strength = isPasswordStrongEnough(parsed.data.newPassword);
  if (!strength.ok) return res.status(400).json({ error: strength.reason });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
      tokenVersion: { increment: 1 },
    },
  });
  const token = signSession({ sub: updated.id, tokenVersion: updated.tokenVersion });
  res.cookie(SESSION_COOKIE_NAME, token, cookieOpts);
  await logAudit(req, "user.password_changed", { entityType: "User", entityId: user.id });
  res.json({ user: shapeUser(updated) });
});

authRouter.post("/realtime-token", requireAuth, (req, res) => {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return res.status(503).json({ error: "Realtime is not configured." });
  const token = jwt.sign(
    { sub: req.user!.id, role: "authenticated", app_role: req.user!.role, aud: "authenticated" },
    secret,
    { expiresIn: "5m" },
  );
  res.json({ token, expiresIn: 300 });
});

// -------------------- Admin: invite a new staff account --------------------

authRouter.post("/invites", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = createInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const { email, name, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.passwordHash) {
    return res.status(409).json({ error: "That person already has an active account." });
  }

  const user =
    existing ??
    (await prisma.user.create({ data: { email, name, role, passwordHash: null } }));

  const { token, tokenHash } = generateInviteToken();
  await prisma.userInvite.create({
    data: {
      userId: user.id,
      tokenHash,
      purpose: "INVITE",
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdBy: req.user!.id,
    },
  });

  await logAudit(req, "user.invite_created", { entityType: "User", entityId: user.id });

  const origin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
  return res.status(201).json({
    inviteLink: `${origin}/accept-invite?token=${token}`,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
});

// -------------------- Admin: issue a password-reset link for a user --------------------

authRouter.post("/users/:id/reset-link", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!target) return res.status(404).json({ error: "User not found." });

  const { token, tokenHash } = generateInviteToken();
  await prisma.userInvite.create({
    data: {
      userId: target.id,
      tokenHash,
      purpose: "RESET",
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
      createdBy: req.user!.id,
    },
  });

  await logAudit(req, "user.reset_link_created", { entityType: "User", entityId: target.id });

  const origin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
  return res.status(201).json({
    resetLink: `${origin}/accept-invite?token=${token}`,
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
});

// -------------------- Accept invite / reset (public, token-gated) --------------------

authRouter.post("/accept-invite", async (req, res) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input." });
  }
  const { token, password } = parsed.data;

  const strength = isPasswordStrongEnough(password);
  if (!strength.ok) {
    return res.status(400).json({ error: strength.reason });
  }

  const tokenHash = hashInviteToken(token);
  const invite = await prisma.userInvite.findUnique({ where: { tokenHash } });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return res.status(400).json({ error: "This link is invalid or has expired." });
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: invite.userId },
      data: { passwordHash, mustChangePassword: false, isActive: true, tokenVersion: { increment: 1 } },
    }),
    prisma.userInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  return res.status(204).end();
});

authRouter.get("/invites/:token/status", async (req, res) => {
  const tokenHash = hashInviteToken(req.params.token);
  const invite = await prisma.userInvite.findUnique({
    where: { tokenHash },
    include: { targetUser: { select: { email: true, name: true } } },
  });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return res.status(404).json({ error: "This link is invalid or has expired." });
  }

  return res.json({
    email: invite.targetUser.email,
    name: invite.targetUser.name,
    purpose: invite.purpose,
  });
});
