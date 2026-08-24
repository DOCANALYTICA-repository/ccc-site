import { describe, it, expect } from "vitest";
import { cleanCell, parsePhoneCell, parseEmailCell, normalizeProfileUrl } from "./normalize.js";

// Every case below is a real value pulled from Copy of Confirmed Guest
// List.xlsx during the planning pass (see PLAN.md section 3). Regression
// tests against the actual mess, not synthetic examples.

describe("cleanCell", () => {
  it("trims and collapses internal whitespace", () => {
    expect(cleanCell("Sourabh jain ")).toBe("Sourabh jain");
    expect(cleanCell("Citi bank ")).toBe("Citi bank");
  });

  it("maps spreadsheet null-spellings to null", () => {
    expect(cleanCell("Na")).toBeNull();
    expect(cleanCell("NA")).toBeNull();
    expect(cleanCell("-")).toBeNull();
    expect(cleanCell("n/a")).toBeNull();
    expect(cleanCell("")).toBeNull();
    expect(cleanCell(null)).toBeNull();
    expect(cleanCell(undefined)).toBeNull();
  });

  it("leaves real text alone", () => {
    expect(cleanCell("No gluten")).toBe("No gluten");
  });
});

describe("parsePhoneCell", () => {
  it("fixes the Excel float artifact instead of stringifying it", () => {
    // ExcelJS hands numeric cells back as JS numbers: 9845627437.0
    const r = parsePhoneCell(9845627437, true);
    expect(r.primary).toBe("+919845627437");
    expect(r.raw).not.toContain(".0");
  });

  it("strips an internal space in a string cell", () => {
    const r = parsePhoneCell("98197 85146", false);
    expect(r.primary).toBe("+919819785146");
  });

  it("splits two numbers crammed into one cell", () => {
    const r = parsePhoneCell("+971552017503, +916238893787", false);
    expect(r.primary).toBe("+971552017503");
    expect(r.alt).toBe("+916238893787");
    expect(r.flagged).toBe(false);
  });

  it("treats the literal 'Na' text as empty, not a phone", () => {
    const r = parsePhoneCell("Na", false);
    expect(r.primary).toBeNull();
    expect(r.flagged).toBe(false);
  });

  it("flags an unparseable value instead of silently dropping it", () => {
    const r = parsePhoneCell("call the office", false);
    expect(r.primary).toBeNull();
    expect(r.raw).toBe("call the office");
    expect(r.flagged).toBe(true);
  });

  it("passes through null cells quietly", () => {
    const r = parsePhoneCell(null, false);
    expect(r.primary).toBeNull();
    expect(r.flagged).toBe(false);
  });
});

describe("parseEmailCell", () => {
  it("splits two space-separated emails into primary and alt", () => {
    const r = parseEmailCell("harsha.reddy@nslinfratech.com harshavardhanareddy@gmail.com");
    expect(r.primary).toBe("harsha.reddy@nslinfratech.com");
    expect(r.alt).toBe("harshavardhanareddy@gmail.com");
    expect(r.flagged).toBe(false);
  });

  it("lowercases and trims a normal address", () => {
    const r = parseEmailCell(" JSathy@StateStreet.com ");
    expect(r.primary).toBe("jsathy@statestreet.com");
  });

  it("flags a malformed address rather than rejecting the row", () => {
    const r = parseEmailCell("not-an-email");
    expect(r.flagged).toBe(true);
    expect(r.primary).toBe("not-an-email");
  });
});

describe("normalizeProfileUrl", () => {
  it("passes through a full LinkedIn URL unchanged", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/in/pankaj-kapoor-538")).toBe(
      "https://www.linkedin.com/in/pankaj-kapoor-538",
    );
  });

  it("adds a scheme to a bare domain", () => {
    expect(normalizeProfileUrl("linkedin.com/in/someone")).toBe("https://linkedin.com/in/someone");
  });

  it("returns null for an empty cell", () => {
    expect(normalizeProfileUrl("")).toBeNull();
  });
});
