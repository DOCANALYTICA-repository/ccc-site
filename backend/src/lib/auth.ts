import jwt from "jsonwebtoken";
import { hash, verify } from "@node-rs/argon2";
import crypto from "node:crypto";

const AUTH_SECRET: string = (() => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET env var is required");
  return secret;
})();

const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8h, matches PLAN.md section 6.5

export interface SessionPayload {
  sub: string; // user id
  tokenVersion: number;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, AUTH_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, AUTH_SECRET);
    if (typeof decoded === "string") return null;
    if (typeof decoded.sub !== "string" || typeof decoded.tokenVersion !== "number") return null;
    return { sub: decoded.sub, tokenVersion: decoded.tokenVersion };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "ccc_session";
export const SESSION_COOKIE_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;

// Frontend and backend are separate Vercel deployments on different
// domains, so the session cookie is genuinely cross-site in production
// and needs SameSite=None — which browsers only honor alongside Secure.
// Dev stays Lax: same-origin via the Vite proxy. Shared by every set/clear
// call site so clearing always matches the attributes it was set with.
const isProd = process.env.NODE_ENV === "production";
export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  path: "/",
};

const ARGON2_OPTS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain, ARGON2_OPTS);
  } catch {
    return false;
  }
}

/** Single-use invite / reset tokens: random bytes handed to the user,
 * only the SHA-256 hash ever persisted. Per PLAN.md section 6.2 / 6.12. */
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "123456789012", "qwertyuiop12",
  "letmein12345", "administrator", "changeme1234", "welcome12345",
]);

export function isPasswordStrongEnough(pw: string): { ok: boolean; reason?: string } {
  if (pw.length < 12) return { ok: false, reason: "Password must be at least 12 characters." };
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    return { ok: false, reason: "That password is too common. Choose something less guessable." };
  }
  return { ok: true };
}
