import { z } from "zod";

export const contactInputSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required."),
  organization: z.string().trim().nullish(),
  designation: z.string().trim().nullish(),
  profileUrl: z.string().trim().nullish(),
  email: z.string().trim().email().nullish().or(z.literal("").transform(() => null)),
  altEmail: z.string().trim().email().nullish().or(z.literal("").transform(() => null)),
  phone: z.string().trim().nullish(),
  altPhone: z.string().trim().nullish(),
  dietaryNotes: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
  tags: z.array(z.string().trim().min(1)).optional(),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export const eventInputSchema = z.object({
  name: z.string().trim().min(1, "Event name is required."),
  description: z.string().trim().nullish(),
  venue: z.string().trim().nullish(),
  startAt: z.coerce.date().nullish(),
  endAt: z.coerce.date().nullish(),
  timezone: z.string().trim().min(1).default("Asia/Kolkata"),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
});
export type EventInput = z.infer<typeof eventInputSchema>;

export const inviteContactsSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1),
  arrivalAt: z.coerce.date().nullish(),
});

export const walkInSchema = z.union([
  z.object({ mode: z.literal("existing"), contactId: z.string().uuid() }),
  z.object({
    mode: z.literal("new"),
    fullName: z.string().trim().min(1),
    organization: z.string().trim().nullish(),
    phone: z.string().trim().nullish(),
    email: z.string().trim().email().nullish().or(z.literal("").transform(() => null)),
  }),
]);

export const statusUpdateSchema = z.object({
  status: z.enum(["UNCONFIRMED", "CONFIRMED", "ARRIVED_IN_CAMPUS"]),
});

export const bulkStatusUpdateSchema = z.object({
  invitationIds: z.array(z.string().uuid()).min(1),
  status: z.enum(["UNCONFIRMED", "CONFIRMED", "ARRIVED_IN_CAMPUS"]),
});

export const invitationDetailSchema = z.object({
  arrivalAt: z.coerce.date().nullish(),
  departureAt: z.coerce.date().nullish(),
  travelMode: z.string().trim().nullish(),
  accommodation: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

export const createInviteSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1),
  role: z.enum(["ADMIN", "STAFF"]).default("STAFF"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
});

export const importRowSchema = z.object({
  // Nullable, not min(1): the server re-validates per row so one bad row
  // fails on its own instead of rejecting the whole batch. See routes/import.ts.
  rowIndex: z.number().int().optional(),
  fullName: z.string().trim().nullable(),
  organization: z.string().nullable(),
  designation: z.string().nullable(),
  profileUrl: z.string().nullable(),
  email: z.string().nullable(),
  altEmail: z.string().nullable(),
  phone: z.string().nullable(),
  altPhone: z.string().nullable(),
  phoneRaw: z.string().nullable(),
  dietaryNotes: z.string().nullable(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const commitImportSchema = z.object({
  filename: z.string(),
  rows: z.array(importRowSchema).min(1),
  duplicateStrategy: z.enum(["SKIP", "UPDATE", "CREATE_ANYWAY"]),
  inviteToEventId: z.string().uuid().nullish(),
});
