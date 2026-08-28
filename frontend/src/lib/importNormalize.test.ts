import { describe, it, expect } from "vitest";
import { guessFieldForHeader } from "./importNormalize";

describe("guessFieldForHeader", () => {
  it("matches 'Full name' with a space", () => {
    expect(guessFieldForHeader("Full name")).toBe("fullName");
  });

  it("matches common header variants case-insensitively", () => {
    expect(guessFieldForHeader("Phone Number")).toBe("phone");
    expect(guessFieldForHeader("Mobile")).toBe("phone");
    expect(guessFieldForHeader("Organisation")).toBe("organization");
    expect(guessFieldForHeader("E-Mail")).toBe("email");
    expect(guessFieldForHeader("Email Address")).toBe("email");
    expect(guessFieldForHeader("Title")).toBe("designation");
  });

  it("falls back to ignore for unknown headers", () => {
    expect(guessFieldForHeader("Random Column")).toBe("ignore");
  });
});
