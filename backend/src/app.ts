import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { contactsRouter } from "./routes/contacts.js";
import { eventsRouter } from "./routes/events.js";
import { importRouter } from "./routes/import.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { communityRouter } from "./routes/community.js";
import { pocRouter } from "./routes/poc.js";
import { networkRouter } from "./routes/network.js";
import { coursesRouter } from "./routes/courses.js";
import { surveysRouter } from "./routes/surveys.js";
import { notificationsRouter } from "./routes/notifications.js";
import { requireTrustedOrigin, trustedOrigins } from "./middleware/security.js";

// Express 4 does not forward rejections out of async route handlers, so an
// unexpected database error surfaces as an unhandled rejection — which Node
// treats as fatal. Serverless hides that (the instance dies, the next request
// gets a fresh one), but the Vercel Services preset may run this as a
// long-lived process, where one transient DB hiccup would take the whole API
// down until it restarted. Mid-event that means the gate stops working.
// Staying up with one failed request beats dying with all of them.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  // See PLAN.md section 6.11: HSTS, no framing, no MIME sniffing, strict CSP.
  // The API serves no HTML, so a locked-down default-src is safe.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || trustedOrigins().includes(origin));
      },
      credentials: true,
    }),
  );

  app.use(cookieParser());
  app.use(express.json({ limit: "8mb" })); // Import batches of 500 rows; see PLAN.md section 5.2.
  app.use(requireTrustedOrigin);

  // Under Vercel's multi-service routing this app is mounted as a service at
  // /api, and every router below is *also* mounted under /api. If that routing
  // ever strips the prefix before handing the request over, nothing would match
  // and every response would be a 404. Re-adding it when absent makes the app
  // behave identically whether it is reached as a standalone deployment or as a
  // service — a no-op in the case where the prefix already survived.
  app.use((req, _res, next) => {
    if (!/^\/api(\/|$|\?)/.test(req.url)) req.url = `/api${req.url}`;
    next();
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/contacts", contactsRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/import", importRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/community", communityRouter);
  // Public by design: the POC gate portal authenticates with its own scoped
  // token rather than a session cookie. See routes/poc.ts.
  app.use("/api/poc", pocRouter);
  app.use("/api/network", networkRouter);
  app.use("/api/courses", coursesRouter);
  app.use("/api/surveys", surveysRouter);
  app.use("/api/notifications", notificationsRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found." }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  });

  return app;
}

/** Vercel detects the Express entrypoint by scanning app/index/server (and
 * their src/ equivalents) for the first file that imports `express`, which is
 * this one — src/server.ts only imports the factory. The detected file has to
 * default-export the app or listen on a port, so export it here. server.ts
 * keeps calling createApp() for the local listener. */
export default createApp();
