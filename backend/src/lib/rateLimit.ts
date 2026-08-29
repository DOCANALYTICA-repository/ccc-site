import { prisma } from "./prisma.js";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

/** Attempts against the POC gate portal are recorded in the same table but
 * must never be counted by the account-login throttle. Every POC at a venue
 * shares one NAT address, so five fumbled passcodes would otherwise lock that
 * IP out of signing in to the application at all — at exactly the moment the
 * gate is busiest. Rows are tagged by this prefix and filtered out below. */
export const POC_PREFIX = "poc:";
const POC_MAX_ATTEMPTS = 10;

/** DB-backed login throttle — see PLAN.md section 1: two users generate
 * no contention, so a login_attempts table replaces Redis entirely. */
export async function isLoginLocked(identifier: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);

  const [byIdentifier, byIp] = await Promise.all([
    prisma.loginAttempt.count({
      where: { identifierAttempted: identifier, succeeded: false, at: { gte: since } },
    }),
    prisma.loginAttempt.count({
      where: {
        ip,
        succeeded: false,
        at: { gte: since },
        NOT: { identifierAttempted: { startsWith: POC_PREFIX } },
      },
    }),
  ]);

  return byIdentifier >= MAX_ATTEMPTS || byIp >= MAX_ATTEMPTS;
}

/** Throttles the gate portal on the session alone, not the caller's address.
 * Session-scoped is the stronger bound anyway: an attacker who rotates IPs
 * still gets ten guesses per quarter hour at a six-digit passcode, while a
 * roomful of POCs behind one router don't throttle each other. */
export async function isPocUnlockLocked(sessionId: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const failures = await prisma.loginAttempt.count({
    where: { identifierAttempted: POC_PREFIX + sessionId, succeeded: false, at: { gte: since } },
  });
  return failures >= POC_MAX_ATTEMPTS;
}

export async function recordLoginAttempt(identifier: string, ip: string, succeeded: boolean) {
  await prisma.loginAttempt.create({
    data: { identifierAttempted: identifier, ip, succeeded },
  });

  // Prune rows older than the window on write — no cron needed at this scale.
  const cutoff = new Date(Date.now() - WINDOW_MS);
  await prisma.loginAttempt.deleteMany({ where: { at: { lt: cutoff } } });
}
