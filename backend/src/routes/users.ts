import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("ADMIN"));

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      passwordHash: true,
    },
    orderBy: { createdAt: "asc" },
  });
  res.json({
    users: users.map((u) => ({ ...u, passwordHash: undefined, hasAcceptedInvite: !!u.passwordHash })),
  });
});

usersRouter.patch("/:id", async (req, res) => {
  const { isActive, role } = req.body as { isActive?: boolean; role?: "ADMIN" | "STAFF" };

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
