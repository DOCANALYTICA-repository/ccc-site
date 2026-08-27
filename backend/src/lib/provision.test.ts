import { describe, expect, it } from "vitest";
import { normalizePhone } from "./provision.js";

describe("normalizePhone", () => {
  it("normalizes an Indian local number for login", () => {
    expect(normalizePhone("98456 27437")).toBe("+919845627437");
  });

  it("preserves an explicit international country code", () => {
    expect(normalizePhone("+971 55 201 7503")).toBe("+971552017503");
  });

  it("rejects unusable login identifiers", () => {
    expect(normalizePhone("call the office")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});
