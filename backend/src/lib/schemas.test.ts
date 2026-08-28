import { describe, it, expect } from "vitest";
import { contactInputSchema, walkInSchema } from "./schemas.js";

describe("contactInputSchema phone normalization", () => {
  it("normalizes a bare Indian number to E.164", () => {
    expect(contactInputSchema.parse({ fullName: "A", phone: "9876500011" }).phone).toBe("+919876500011");
  });

  it("leaves an already-E.164 number unchanged", () => {
    expect(contactInputSchema.parse({ fullName: "A", phone: "+919876500011" }).phone).toBe("+919876500011");
  });

  it("strips internal spaces before normalizing", () => {
    expect(contactInputSchema.parse({ fullName: "A", phone: "98765 00011" }).phone).toBe("+919876500011");
  });

  it("keeps an unparseable phone verbatim rather than dropping it", () => {
    expect(contactInputSchema.parse({ fullName: "A", phone: "ext 4021" }).phone).toBe("ext 4021");
  });

  it("maps empty / missing phone to null", () => {
    expect(contactInputSchema.parse({ fullName: "A", phone: "" }).phone).toBeNull();
    expect(contactInputSchema.parse({ fullName: "A" }).phone ?? null).toBeNull();
  });

  it("normalizes altPhone the same way", () => {
    expect(contactInputSchema.parse({ fullName: "A", altPhone: "9876500011" }).altPhone).toBe("+919876500011");
  });
});

describe("walkInSchema new-guest phone normalization", () => {
  it("normalizes the phone on a new walk-in", () => {
    const r = walkInSchema.parse({ mode: "new", fullName: "Guest", phone: "9876500011" });
    expect(r).toMatchObject({ mode: "new", phone: "+919876500011" });
  });
});
