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
import { networkRouter } from "./routes/network.js";
import { coursesRouter } from "./routes/courses.js";
import { surveysRouter } from "./routes/surveys.js";
import { notificationsRouter } from "./routes/notifications.js";
import { requireTrustedOrigin, trustedOrigins } from "./middleware/security.js";

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

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/contacts", contactsRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/import", importRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/community", communityRouter);
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
