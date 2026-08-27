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

  const user = await db.user.create({
    data: {
      name: contact.fullName,
      phone,
      role: "GUEST",
      passwordHash: await hashPassword("1234"),
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
