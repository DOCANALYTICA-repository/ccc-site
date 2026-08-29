import { describe, expect, it } from "vitest";
import {
  dashboardSelectionSchema,
  MAX_DASHBOARD_CARDS,
  normalizeCardKeys,
  toCardRows,
} from "./dashboardCards.js";

describe("dashboardSelectionSchema", () => {
  it("accepts a normal selection", () => {
    const parsed = dashboardSelectionSchema.safeParse({ cardKeys: ["industry", "question:abc"] });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty selection, which is how a dashboard is cleared", () => {
    expect(dashboardSelectionSchema.safeParse({ cardKeys: [] }).success).toBe(true);
  });

  it("rejects a missing or wrongly typed field", () => {
    expect(dashboardSelectionSchema.safeParse({}).success).toBe(false);
    expect(dashboardSelectionSchema.safeParse({ cardKeys: "industry" }).success).toBe(false);
    expect(dashboardSelectionSchema.safeParse({ cardKeys: [1, 2] }).success).toBe(false);
  });

  it("rejects blank keys and absurdly long ones", () => {
    expect(dashboardSelectionSchema.safeParse({ cardKeys: [""] }).success).toBe(false);
    expect(dashboardSelectionSchema.safeParse({ cardKeys: ["   "] }).success).toBe(false);
    expect(dashboardSelectionSchema.safeParse({ cardKeys: ["x".repeat(201)] }).success).toBe(false);
  });

  it("caps the number of pinned charts so a client cannot write unbounded rows", () => {
    const atLimit = Array.from({ length: MAX_DASHBOARD_CARDS }, (_, i) => `card-${i}`);
    expect(dashboardSelectionSchema.safeParse({ cardKeys: atLimit }).success).toBe(true);
    expect(dashboardSelectionSchema.safeParse({ cardKeys: [...atLimit, "one-too-many"] }).success).toBe(false);
  });
});

describe("normalizeCardKeys", () => {
  it("keeps the submitted order, which is what the dashboard pages through", () => {
    expect(normalizeCardKeys(["leads", "industry", "timeline"])).toEqual(["leads", "industry", "timeline"]);
  });

  it("drops duplicates rather than letting them collide on the unique index", () => {
    expect(normalizeCardKeys(["industry", "leads", "industry"])).toEqual(["industry", "leads"]);
  });

  it("trims surrounding whitespace and drops keys that were only whitespace", () => {
    expect(normalizeCardKeys(["  industry  ", "   ", "leads"])).toEqual(["industry", "leads"]);
  });

  it("treats a trimmed duplicate as the same key", () => {
    expect(normalizeCardKeys(["industry", " industry "])).toEqual(["industry"]);
  });

  it("returns nothing for an empty list", () => {
    expect(normalizeCardKeys([])).toEqual([]);
  });
});

describe("toCardRows", () => {
  it("positions rows from zero in submitted order", () => {
    expect(toCardRows("u1", "e1", ["leads", "industry"])).toEqual([
      { userId: "u1", eventId: "e1", cardKey: "leads", position: 0 },
      { userId: "u1", eventId: "e1", cardKey: "industry", position: 1 },
    ]);
  });

  it("renumbers after duplicates are removed, leaving no gaps", () => {
    const rows = toCardRows("u1", "e1", ["a", "a", "b"]);
    expect(rows.map((r) => r.position)).toEqual([0, 1]);
    expect(rows.map((r) => r.cardKey)).toEqual(["a", "b"]);
  });

  it("produces no rows for an empty selection", () => {
    expect(toCardRows("u1", "e1", [])).toEqual([]);
  });

  it("scopes every row to the given user and event", () => {
    const rows = toCardRows("user-9", "event-9", ["industry"]);
    expect(rows[0]).toMatchObject({ userId: "user-9", eventId: "event-9" });
  });
});
