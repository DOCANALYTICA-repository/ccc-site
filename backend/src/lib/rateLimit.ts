import { prisma } from "./prisma.js";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

/** DB-backed login throttle — see PLAN.md section 1: two users generate
 * no contention, so a login_attempts table replaces Redis entirely. */
export async function isLoginLocked(identifier: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);

  const [byIdentifier, byIp] = await Promise.all([
    prisma.loginAttempt.count({
      where: { identifierAttempted: identifier, succeeded: false, at: { gte: since } },
    }),
    prisma.loginAttempt.count({
      where: { ip, succeeded: false, at: { gte: since } },
    }),
  ]);

  return byIdentifier >= MAX_ATTEMPTS || byIp >= MAX_ATTEMPTS;
}

export async function recordLoginAttempt(identifier: string, ip: string, succeeded: boolean) {
  await prisma.loginAttempt.create({
    data: { identifierAttempted: identifier, ip, succeeded },
  });

  // Prune rows older than the window on write — no cron needed at this scale.
  const cutoff = new Date(Date.now() - WINDOW_MS);
  await prisma.loginAttempt.deleteMany({ where: { at: { lt: cutoff } } });
}
