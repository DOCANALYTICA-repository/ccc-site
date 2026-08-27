import type { Request, Response, NextFunction } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function trustedOrigins() {
  return (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** Cookie sessions are cross-origin in production. Reject state-changing
 * requests unless their Origin is the configured frontend. */
export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (process.env.NODE_ENV === "test") return next();
  const origin = req.get("origin");
  if (!origin || !trustedOrigins().includes(origin)) {
    return res.status(403).json({ error: "Untrusted request origin." });
  }
  next();
}
