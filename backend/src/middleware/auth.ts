import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { verifySession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTS } from "../lib/auth.js";

export interface AuthedUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/** Denies by default. Every route that isn't explicitly public must sit
 * behind this. Re-checks token_version against the DB on every request so
 * deactivating a user or resetting a password kills live sessions
 * immediately — see PLAN.md section 6.4. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  const payload = verifySession(token);
  if (!payload) {
    return res.status(401).json({ error: "Session invalid or expired." });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
    res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTS);
    return res.status(401).json({ error: "Session invalid or expired." });
  }

  req.user = {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
  const passwordAllowed = ["/api/auth/me", "/api/auth/change-password", "/api/auth/logout"];
  if (user.mustChangePassword && !passwordAllowed.some((path) => req.originalUrl.startsWith(path))) {
    return res.status(428).json({ error: "Change your temporary password to continue.", code: "PASSWORD_CHANGE_REQUIRED" });
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Not permitted." });
    }
    next();
  };
}

export const requireInternal = requireRole("ADMIN", "STAFF");
