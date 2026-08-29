/**
 * Creates one obviously-fake guest for testing the questionnaire end to end.
 *
 *   npx tsx scripts/create-dummy-guest.ts "Corpus Conclave"
 *
 * Makes a contact, an invitation already marked as arrived (the questionnaire
 * is only offered to arrived guests), a login, and a seat at a table so the
 * table analytics have something to move. Re-running updates the same records
 * rather than creating duplicates.
 *
 * Everything is named "Dummy Test Guest" at example.invalid so it is obvious in
 * any list and safe to delete — see the bottom of this file for the cleanup.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/auth.js";

const NAME = "Dummy Test Guest";
const EMAIL = "dummy.guest@example.invalid";
const PHONE = "+919000000099";
const PASSWORD = "DummyGuest!2026";
const ORG = "Dummy Testing Co";
const TABLE_NUMBER = 1;

async function main() {
  const eventName = process.argv[2] ?? "Corpus Conclave";
  const event = await prisma.event.findFirst({ where: { name: eventName } });
  if (!event) throw new Error(`No event named "${eventName}".`);

  const contact = await prisma.contact.upsert({
    where: { id: (await prisma.contact.findFirst({ where: { email: EMAIL }, select: { id: true } }))?.id ?? "00000000-0000-0000-0000-000000000000" },
    create: {
      fullName: NAME,
      organization: ORG,
      designation: "Test Director",
      email: EMAIL,
      phone: PHONE,
      source: "MANUAL",
    },
    update: { fullName: NAME, organization: ORG, designation: "Test Director", phone: PHONE },
  });

  // The questionnaire is only served to guests marked as arrived.
  const invitation = await prisma.eventInvitation.upsert({
    where: { eventId_contactId: { eventId: event.id, contactId: contact.id } },
    create: { eventId: event.id, contactId: contact.id, status: "ARRIVED_IN_CAMPUS", arrivalAt: new Date() },
    update: { status: "ARRIVED_IN_CAMPUS" },
  });

  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      phone: PHONE,
      name: NAME,
      passwordHash,
      role: "GUEST",
      mustChangePassword: false,
      contactId: contact.id,
    },
    update: { passwordHash, mustChangePassword: false, isActive: true, contactId: contact.id },
  });

  // Seat them so the table charts have a live data point to move.
  await prisma.eventSeating.upsert({
    where: { eventId_contactId: { eventId: event.id, contactId: contact.id } },
    create: {
      eventId: event.id,
      contactId: contact.id,
      tableNumber: TABLE_NUMBER,
      tableLabel: `Table ${TABLE_NUMBER}`,
      programmeFocus: "BCOM (AFA)",
      seniorityBand: "6. Director / Function Head",
    },
    update: { tableNumber: TABLE_NUMBER, tableLabel: `Table ${TABLE_NUMBER}` },
  });

  console.log("Dummy guest ready.\n");
  console.log(`  sign in with : ${EMAIL}`);
  console.log(`  or phone     : ${PHONE}`);
  console.log(`  password     : ${PASSWORD}`);
  console.log(`  seated at    : Table ${TABLE_NUMBER} (BCOM (AFA))`);
  console.log(`  contact id   : ${contact.id}`);
  console.log(`  user id      : ${user.id}`);
  console.log(`  invitation   : ${invitation.id} (${invitation.status})`);
  console.log("\nTo remove it later:  npx tsx scripts/create-dummy-guest.ts --delete");
}

async function remove() {
  const contact = await prisma.contact.findFirst({ where: { email: EMAIL } });
  if (!contact) { console.log("No dummy guest to remove."); return; }
  // Responses and seating cascade from the contact; the account is separate.
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.eventInvitation.deleteMany({ where: { contactId: contact.id } });
  await prisma.contact.delete({ where: { id: contact.id } });
  console.log("Dummy guest removed.");
}

const run = process.argv.includes("--delete") ? remove : main;
run().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
