import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import { z } from "zod";
import { hashPassword, isPasswordStrongEnough } from "../lib/auth.js";
import { normalizePhone } from "../lib/provision.js";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("ADMIN"));

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      passwordHash: true,
      mustChangePassword: true,
    },
    orderBy: { createdAt: "asc" },
  });
  res.json({
    users: users.map((u) => ({ ...u, passwordHash: undefined, hasAcceptedInvite: !!u.passwordHash })),
  });
});

usersRouter.post("/members", async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().min(1),
    temporaryPassword: z.string().min(1),
    role: z.enum(["MEMBER", "GUEST"]).default("MEMBER"),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid account." });
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return res.status(400).json({ error: "Enter a valid phone number." });
  const strength = isPasswordStrongEnough(parsed.data.temporaryPassword);
  if (!strength.ok && parsed.data.role === "MEMBER") return res.status(400).json({ error: strength.reason });
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      phone,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.temporaryPassword),
      mustChangePassword: true,
      profile: { create: { displayName: parsed.data.name, discoverable: parsed.data.role === "MEMBER" } },
    },
    include: { profile: true },
  });
  await logAudit(req, "user.member_created", { entityType: "User", entityId: user.id, diff: { role: user.role } });
  res.status(201).json({ user });
});

usersRouter.patch("/:id", async (req, res) => {
  const { isActive, role } = req.body as { isActive?: boolean; role?: "ADMIN" | "STAFF" | "MEMBER" | "GUEST" };

  if (req.params.id === req.user!.id && isActive === false) {
    return res.status(400).json({ error: "You can't deactivate your own account." });
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(isActive !== undefined ? { isActive } : {}),
      ...(role !== undefined ? { role } : {}),
      // Bump token_version whenever access is revoked so any live session dies now.
      ...(isActive === false ? { tokenVersion: { increment: 1 } } : {}),
    },
  });

  await logAudit(req, "user.updated", { entityType: "User", entityId: user.id, diff: req.body });
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive } });
});
