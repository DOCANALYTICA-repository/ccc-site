import { parsePhoneNumberWithError, type CountryCode } from "libphonenumber-js";

// Mirrors backend/src/lib/normalize.ts — normalization happens in the
// browser (PLAN.md section 5.2) so large files never hit the 4.5MB Vercel
// body cap. Small app, so duplicating ~80 lines beats a shared package.

const NULLISH_TEXT = new Set(["", "-", "na", "n/a", "nil", "none"]);

export function cleanCell(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/\s+/g, " ");
  if (NULLISH_TEXT.has(s.toLowerCase())) return null;
  return s === "" ? null : s;
}

export interface PhoneParseResult {
  primary: string | null;
  alt: string | null;
  raw: string | null;
  flagged: boolean;
}

export function parsePhoneCell(
  rawValue: unknown,
  cellIsNumeric: boolean,
  defaultRegion: CountryCode = "IN",
): PhoneParseResult {
  if (rawValue === null || rawValue === undefined) {
    return { primary: null, alt: null, raw: null, flagged: false };
  }

  let text: string;
  if (cellIsNumeric && typeof rawValue === "number") {
    text = String(Math.trunc(rawValue));
  } else {
    text = String(rawValue).trim();
  }

  const cleanedWhole = cleanCell(text);
  if (cleanedWhole === null) return { primary: null, alt: null, raw: null, flagged: false };

  const parts = cleanedWhole
    .split(/,|\/|&|\band\b/i)
    .map((p) => p.replace(/[\s()-]/g, "").trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return { primary: null, alt: null, raw: cleanedWhole, flagged: true };

  const parsed = parts.map((p) => tryParseOne(p, defaultRegion));
  const primary = parsed[0] ?? null;
  const alt = parsed[1] ?? null;
  const anyUnparsed = parts.some((_, i) => parsed[i] === null);

  return { primary, alt, raw: cleanedWhole, flagged: anyUnparsed };
}

function tryParseOne(part: string, defaultRegion: CountryCode): string | null {
  try {
    const num = parsePhoneNumberWithError(part, defaultRegion);
    return num.isValid() ? num.number : null;
  } catch {
    return null;
  }
}

export interface EmailParseResult {
  primary: string | null;
  alt: string | null;
  flagged: boolean;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function parseEmailCell(rawValue: unknown): EmailParseResult {
  const cleaned = cleanCell(rawValue);
  if (cleaned === null) return { primary: null, alt: null, flagged: false };

  const parts = cleaned
    .split(/[\s,;]+/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return { primary: null, alt: null, flagged: false };

  const primary = parts[0] ?? null;
  const alt = parts[1] ?? null;
  const flagged = parts.some((p) => !EMAIL_RE.test(p));

  return { primary, alt, flagged };
}

export function normalizeProfileUrl(rawValue: unknown): string | null {
  const cleaned = cleanCell(rawValue);
  if (cleaned === null) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return `https://${cleaned}`;
}

// -------------------- Column mapping --------------------

export type FieldKey =
  | "fullName"
  | "organization"
  | "designation"
  | "profileUrl"
  | "phone"
  | "email"
  | "dietaryNotes"
  | "ignore";

const KNOWN_HEADERS: Record<string, FieldKey> = {
  name: "fullName",
  fullname: "fullName",
  "company name": "organization",
  company: "organization",
  organization: "organization",
  position: "designation",
  designation: "designation",
  profile: "profileUrl",
  linkedin: "profileUrl",
  "phone no.": "phone",
  "phone no": "phone",
  phone: "phone",
  "mail id": "email",
  email: "email",
  "food pref.": "dietaryNotes",
  "food pref": "dietaryNotes",
  "food preference": "dietaryNotes",
};

export function guessFieldForHeader(header: string): FieldKey {
  const key = header.trim().toLowerCase();
  return KNOWN_HEADERS[key] ?? "ignore";
}

export interface ParsedImportRow {
  rowIndex: number;
  fullName: string | null;
  organization: string | null;
  designation: string | null;
  profileUrl: string | null;
  email: string | null;
  altEmail: string | null;
  phone: string | null;
  altPhone: string | null;
  phoneRaw: string | null;
  dietaryNotes: string | null;
  flagged: boolean;
  flagReasons: string[];
}
