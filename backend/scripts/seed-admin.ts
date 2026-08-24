import "dotenv/config";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword, isPasswordStrongEnough } from "../src/lib/auth.js";

// Run locally against production: `npm run seed:admin`.
// No bootstrap HTTP endpoint is ever deployed — see PLAN.md section 6.1.
async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  const email = (await rl.question("Admin email: ")).trim();
  const name = (await rl.question("Admin name: ")).trim();
  const password = await rl.question("Admin password (min 12 chars): ");

  rl.close();

  const strength = isPasswordStrongEnough(password);
  if (!strength.ok) {
    console.error(strength.reason);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", isActive: true, tokenVersion: { increment: 1 } },
    create: { email, name, role: "ADMIN", passwordHash, isActive: true },
  });

  console.log(`Admin ready: ${user.email} (${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
