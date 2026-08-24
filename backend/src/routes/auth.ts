import { Router } from "express";
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
import { loginSchema, createInviteSchema, acceptInviteSchema } from "../lib/schemas.js";
import { logAudit } from "../lib/audit.js";

export const authRouter = Router();

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

const cookieOpts = { ...SESSION_COOKIE_OPTS, maxAge: SESSION_COOKIE_MAX_AGE_MS };

// -------------------- Login / logout / me --------------------

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input." });
  }
  const { email, password } = parsed.data;
  const ip = req.ip ?? "unknown";

  if (await isLoginLocked(email, ip)) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Generic failure message throughout — no user-enumeration leak.
  const genericFail = async () => {
    await recordLoginAttempt(email, ip, false);
    return res.status(401).json({ error: "Invalid email or password." });
  };

  if (!user || !user.isActive || !user.passwordHash) return genericFail();

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) return genericFail();

  await recordLoginAttempt(email, ip, true);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signSession({ sub: user.id, tokenVersion: user.tokenVersion });
  res.cookie(SESSION_COOKIE_NAME, token, cookieOpts);
  return res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTS);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
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
      data: { passwordHash, isActive: true, tokenVersion: { increment: 1 } },
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
