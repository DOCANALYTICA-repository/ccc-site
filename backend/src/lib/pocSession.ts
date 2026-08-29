import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

/** The POC check-in portal replaces guests scanning a venue QR: a student
 * point-of-contact scans one QR, unlocks the portal with a passcode they were
 * told separately, and marks guests in as they arrive.
 *
 * Two tokens, because they defend against different things:
 *
 *   portal token  — encoded in the printed QR. Long-lived (the session's
 *                   lifetime) and therefore a bearer credential anyone who
 *                   photographs the poster holds. On its own it grants
 *                   nothing; it only identifies which session to unlock.
 *   access token  — issued after the passcode check, short-lived, and the
 *                   only thing that can read a roster or mark an arrival.
 *
 * Both carry the session id, so ending the session in the admin UI revokes
 * every outstanding token at once — the session's isActive flag is checked
 * on every portal request, not just at unlock.
 */

const PORTAL_KIND = "poc-portal";
const ACCESS_KIND = "poc-access";

/** Access tokens outlive a phone locking itself mid-shift but not the event. */
const ACCESS_TTL_SECONDS = 12 * 60 * 60;

function secret(): string {
  const value = process.env.CHECKIN_SECRET ?? process.env.AUTH_SECRET;
  if (!value) throw new Error("CHECKIN_SECRET or AUTH_SECRET env var is required");
  return value;
}

export interface PocTokenPayload {
  sessionId: string;
  eventId: string;
}

export function signPortalToken(payload: PocTokenPayload, expiresAt: Date): string {
  const ttl = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return jwt.sign({ ...payload, kind: PORTAL_KIND }, secret(), { expiresIn: ttl });
}

export function signAccessToken(payload: PocTokenPayload): string {
  return jwt.sign({ ...payload, kind: ACCESS_KIND }, secret(), { expiresIn: ACCESS_TTL_SECONDS });
}

function verify_(token: string, kind: string): PocTokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === "string") return null;
    if (decoded.kind !== kind) return null;
    if (typeof decoded.sessionId !== "string" || typeof decoded.eventId !== "string") return null;
    return { sessionId: decoded.sessionId, eventId: decoded.eventId };
  } catch {
    return null;
  }
}

export const verifyPortalToken = (token: string) => verify_(token, PORTAL_KIND);
export const verifyAccessToken = (token: string) => verify_(token, ACCESS_KIND);

const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** Six digits: long enough that guessing it inside the lockout window is
 * hopeless, short enough to read off a printed sheet at a noisy gate. */
export function generatePasscode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export const hashPasscode = (passcode: string) => hash(passcode, ARGON2_OPTS);

export async function verifyPasscode(passcodeHash: string, passcode: string): Promise<boolean> {
  try {
    return await verify(passcodeHash, passcode, ARGON2_OPTS);
  } catch {
    return false;
  }
}
