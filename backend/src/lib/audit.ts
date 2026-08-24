import type { Request } from "express";
import { prisma } from "./prisma.js";

export async function logAudit(
  req: Request,
  action: string,
  opts: { entityType?: string; entityId?: string; diff?: unknown } = {},
) {
  await prisma.auditLog.create({
    data: {
      actorId: req.user?.id ?? null,
      action,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      diff: opts.diff === undefined ? undefined : (opts.diff as object),
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    },
  });
}
