import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireInternal } from "../middleware/auth.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireInternal);

dashboardRouter.get("/", async (_req, res) => {
  const events = await prisma.event.findMany({
    where: { status: { in: ["ACTIVE", "DRAFT"] } },
    orderBy: { startAt: "asc" },
  });

  const tiles = await Promise.all(
    events.map(async (event) => {
      const counts = await prisma.eventInvitation.groupBy({
        by: ["status"],
        where: { eventId: event.id },
        _count: true,
      });
      const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));
      const total = counts.reduce((sum, c) => sum + c._count, 0);

      const now = new Date();
      const soon = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const arrivingSoon = await prisma.eventInvitation.findMany({
        where: { eventId: event.id, arrivalAt: { gte: now, lte: soon }, status: { not: "ARRIVED_IN_CAMPUS" } },
        include: { contact: { select: { fullName: true, organization: true } } },
        orderBy: { arrivalAt: "asc" },
        take: 10,
      });

      return {
        event,
        total,
        confirmed: byStatus.CONFIRMED ?? 0,
        unconfirmed: byStatus.UNCONFIRMED ?? 0,
        arrived: byStatus.ARRIVED_IN_CAMPUS ?? 0,
        arrivingSoon,
      };
    }),
  );

  res.json({ tiles });
});
