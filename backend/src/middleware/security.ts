import type { Request, Response, NextFunction } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function trustedOrigins() {
  return (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** The origin this request was actually addressed to. Behind Vercel's proxy
 * that is the deployment's public host, which `trust proxy` makes visible
 * through req.protocol and the Host header. */
function selfOrigin(req: Request) {
  const host = req.get("host");
  return host ? `${req.protocol}://${host}` : null;
}

/** Cookie sessions are open to CSRF, so state-changing requests must carry an
 * Origin we recognise.
 *
 * The frontend and the API are served from one domain now, so the ordinary
 * case is a same-origin request — and comparing Origin against the host the
 * request was sent to is the standard defence: a cross-site attacker cannot
 * forge the Origin header. Accepting it here also means preview deployments
 * and custom domains work without anyone remembering to add their URL to
 * FRONTEND_ORIGIN, which stays for genuinely cross-origin frontends. */
export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (process.env.NODE_ENV === "test") return next();
  const origin = req.get("origin");
  if (!origin) return res.status(403).json({ error: "Untrusted request origin." });
  if (origin === selfOrigin(req) || trustedOrigins().includes(origin)) return next();
  return res.status(403).json({ error: "Untrusted request origin." });
}
