import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { hashPassword } from "./auth.js";

type Db = PrismaClient | Prisma.TransactionClient;

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return parsePhoneNumberWithError(
      value,
      (process.env.DEFAULT_PHONE_REGION ?? "IN") as "IN",
    ).number;
  } catch {
    return null;
  }
}

// Deliberately excludes 0/O/1/I/L: this gets read off a printed sheet and
// typed on a phone by someone standing in a queue.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A distinct one-time credential per guest.
 *
 * The alternative — one well-known bootstrap password for every provisioned
 * account — makes each guest's phone number the only secret protecting their
 * account, and phone numbers are not secrets. With ~30 bits of entropy here,
 * knowing someone is on the guest list gets an attacker no further. */
export function generateBootstrapCode(): string {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export async function ensureGuestAccount(db: Db, contactId: string) {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    include: { account: true },
  });
  if (!contact) return { status: "CONTACT_NOT_FOUND" as const };
  if (contact.account) return { status: "READY" as const, user: contact.account };
  const phone = normalizePhone(contact.phone);
  if (!phone) return { status: "NEEDS_PHONE" as const };
  const collision = await db.user.findUnique({ where: { phone } });
  if (collision) return { status: "PHONE_CONFLICT" as const, conflictingUserId: collision.id };

  const bootstrapCode = generateBootstrapCode();
  const user = await db.user.create({
    data: {
      name: contact.fullName,
      phone,
      role: "GUEST",
      passwordHash: await hashPassword(bootstrapCode),
      bootstrapCode,
      mustChangePassword: true,
      contactId: contact.id,
      profile: {
        create: {
          displayName: contact.fullName,
          organization: contact.organization,
          designation: contact.designation,
          publicEmail: contact.email,
          linkedInUrl: contact.profileUrl,
          discoverable: false,
        },
      },
    },
  });
  return { status: "CREATED" as const, user };
}
