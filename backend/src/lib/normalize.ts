import { parsePhoneNumberWithError } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";

const NULLISH_TEXT = new Set(["", "-", "na", "n/a", "nil", "none"]);

/** Trims, collapses internal whitespace, and maps the spreadsheet's various
 * "empty" spellings ("Na", "-", "n/a"...) to null. See PLAN.md section 5.2. */
export function cleanCell(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/\s+/g, " ");
  if (NULLISH_TEXT.has(s.toLowerCase())) return null;
  return s === "" ? null : s;
}

export interface PhoneParseResult {
  primary: string | null; // E.164
  alt: string | null; // E.164
  raw: string | null; // original cleaned text, always preserved
  flagged: boolean; // true if something looked like a phone but didn't parse
}

/** Handles the specific mess found in the real guest-list export:
 * numeric-cell ".0" suffixes, internal spaces, and two numbers crammed
 * into one cell separated by a comma/slash/"and". See PLAN.md section 5.2. */
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
    // Never String(1234567890.0) -> "1234567890.0" — round to an integer string.
    text = String(Math.trunc(rawValue));
  } else {
    text = String(rawValue).trim();
  }

  const cleanedWhole = cleanCell(text);
  if (cleanedWhole === null) {
    return { primary: null, alt: null, raw: null, flagged: false };
  }

  const parts = cleanedWhole
    .split(/,|\/|&|\band\b/i)
    .map((p) => p.replace(/[\s()-]/g, "").trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) {
    return { primary: null, alt: null, raw: cleanedWhole, flagged: true };
  }

  const parsed = parts.map((p) => tryParseOne(p, defaultRegion));
  const primary = parsed[0] ?? null;
  const alt = parsed[1] ?? null;
  const anyUnparsed = parts.some((_, i) => parsed[i] === null);

  return {
    primary,
    alt,
    raw: cleanedWhole,
    flagged: anyUnparsed,
  };
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

/** One row in the source file had two emails space-separated in one cell.
 * Split on whitespace/comma/semicolon and validate each independently. */
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
