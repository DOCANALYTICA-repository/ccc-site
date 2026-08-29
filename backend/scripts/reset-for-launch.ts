import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword, isPasswordStrongEnough } from "../src/lib/auth.js";
import { ensureGuestAccount } from "../src/lib/provision.js";

/** Wipes everything the app has *done* while keeping everything it was *given*.
 *
 * Kept:   the Corpus Conclave event, its questionnaire and the template behind
 *         it, the imported guest list, and the published course catalogs.
 * Wiped:  every account, invitation, check-in session, connection,
 *         conversation, notification, response, import batch and audit entry
 *         produced during testing.
 *
 * Then it re-seeds exactly one admin and puts the imported guest list back on
 * the Corpus Conclave roster as UNCONFIRMED, provisioning a guest account per
 * contact with its own one-time code.
 *
 * Run with --confirm. Without it, this only reports what it would delete.
 */

const ADMIN_IDENTIFIER = "ccc@admin";
const ADMIN_NAME = "CCC Administrator";
const EVENT_NAME = "Corpus Conclave";

const confirmed = process.argv.includes("--confirm");

async function survey() {
  const [event, contacts, users, counts] = await Promise.all([
    prisma.event.findFirst({ where: { name: EVENT_NAME }, include: { survey: true } }),
    prisma.contact.count({ where: { source: "IMPORT" } }),
    prisma.user.count(),
    Promise.all([
      prisma.eventInvitation.count(),
      prisma.invitationStatusHistory.count(),
      prisma.eventCheckInSession.count(),
      prisma.surveyResponse.count(),
      prisma.notification.count(),
      prisma.connection.count(),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.networkProfile.count(),
      prisma.importBatch.count(),
      prisma.auditLog.count(),
      prisma.contact.count({ where: { source: { not: "IMPORT" } } }),
    ]),
  ]);
  return { event, contacts, users, counts };
}

async function main() {
  const password = process.env.CCC_ADMIN_PASSWORD;
  if (!password) {
    console.error("Set CCC_ADMIN_PASSWORD in the environment before running this.");
    process.exit(1);
  }
  const strength = isPasswordStrongEnough(password);
  if (!strength.ok) {
    console.error(strength.reason);
    process.exit(1);
  }

  const before = await survey();
  if (!before.event) {
    console.error(`No event named "${EVENT_NAME}" found — refusing to run, since the reset is defined relative to it.`);
    process.exit(1);
  }

  const [
    invitations, history, sessions, responses, notifications,
    connections, conversations, messages, profiles, batches, audit, testContacts,
  ] = before.counts;

  console.log(`Keeping:  event "${before.event.name}"${before.event.survey ? ` + questionnaire "${before.event.survey.title}"` : ""}`);
  console.log(`          ${before.contacts} imported guest contacts`);
  console.log("\nDeleting:");
  console.log(`          ${before.users} user accounts (all of them)`);
  console.log(`          ${testContacts} non-imported (test) contacts`);
  console.log(`          ${invitations} invitations, ${history} status-history rows`);
  console.log(`          ${sessions} check-in sessions, ${responses} questionnaire responses`);
  console.log(`          ${connections} connections, ${conversations} conversations, ${messages} messages`);
  console.log(`          ${profiles} network profiles, ${notifications} notifications`);
  console.log(`          ${batches} import batches, ${audit} audit entries`);

  if (!confirmed) {
    console.log("\nDry run. Re-run with --confirm to apply.");
    return;
  }

  console.log("\nApplying…");

  // Order matters where onDelete is Restrict rather than Cascade:
  // event_invitations restricts its contact, and messages restrict their
  // sender, so those go before contacts and users respectively.
  await prisma.$transaction([
    prisma.surveyAnswer.deleteMany({}),
    prisma.surveyResponse.deleteMany({}),
    prisma.notification.deleteMany({}),
    prisma.message.deleteMany({}),
    prisma.conversationParticipant.deleteMany({}),
    prisma.conversation.deleteMany({}),
    prisma.connection.deleteMany({}),
    prisma.userBlock.deleteMany({}),
    prisma.invitationStatusHistory.deleteMany({}),
    prisma.eventInvitation.deleteMany({}),
    prisma.eventCheckInSession.deleteMany({}),
    prisma.importBatch.deleteMany({}),
    prisma.auditLog.deleteMany({}),
    prisma.userInvite.deleteMany({}),
    prisma.loginAttempt.deleteMany({}),
    prisma.networkProfile.deleteMany({}),
    prisma.accessGroupMember.deleteMany({}),
    prisma.catalogGrant.deleteMany({}),
    // Test contacts only. IMPORT is the real guest list and stays.
    prisma.contact.deleteMany({ where: { source: { not: "IMPORT" } } }),
    prisma.user.deleteMany({}),
  ]);

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_IDENTIFIER,
      name: ADMIN_NAME,
      role: "ADMIN",
      passwordHash: await hashPassword(password),
      isActive: true,
    },
  });
  console.log(`  admin re-seeded: ${admin.email}`);

  // Put the guest list back on the roster. Each contact gets its own guest
  // account with a distinct one-time code; export the roster's onboarding CSV
  // to hand those out.
  const contacts = await prisma.contact.findMany({
    where: { source: "IMPORT", deletedAt: null },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });

  const provisioning: Record<string, number> = {};
  for (const contact of contacts) {
    await prisma.eventInvitation.create({
      data: { eventId: before.event.id, contactId: contact.id, addedBy: admin.id },
    });
    const account = await ensureGuestAccount(prisma, contact.id);
    provisioning[account.status] = (provisioning[account.status] ?? 0) + 1;
  }

  console.log(`  ${contacts.length} guests invited to "${before.event.name}" as UNCONFIRMED`);
  for (const [status, count] of Object.entries(provisioning)) {
    console.log(`    account provisioning — ${status}: ${count}`);
  }
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
