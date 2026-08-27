import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 40, 100);
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take,
  });
  const unread = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } });
  res.json({ notifications, unread });
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.id },
    data: { readAt: new Date() },
  });
  if (!result.count) return res.status(404).json({ error: "Notification not found." });
  res.status(204).end();
});

notificationsRouter.post("/read-all", async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});
