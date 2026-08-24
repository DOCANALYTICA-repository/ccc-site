import { PrismaClient } from "@prisma/client";

// Single shared instance — avoids exhausting Postgres connections
// across hot-reloads in dev and across serverless invocations in prod.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
