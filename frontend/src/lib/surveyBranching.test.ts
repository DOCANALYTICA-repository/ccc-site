import { describe, expect, it } from "vitest";
import { isAffirmative, visibleQuestions } from "./surveyBranching";

const q = (position: number, dependsOnPosition: number | null, type = "SINGLE_SELECT") => ({
  id: `q${position}`, type, position, dependsOnPosition,
});

describe("isAffirmative", () => {
  it("counts every degree of willingness, but not a refusal", () => {
    const question = { type: "SINGLE_SELECT" };
    expect(isAffirmative(question, "Yes, subject to discussion")).toBe(true);
    expect(isAffirmative(question, "Interested in exploring")).toBe(true);
    expect(isAffirmative(question, "Not at present")).toBe(false);
    expect(isAffirmative(question, undefined)).toBe(false);
  });

  it("needs one non-refusal on a multi-select", () => {
    expect(isAffirmative({ type: "MULTI_SELECT" }, ["Nothing right now"])).toBe(false);
    expect(isAffirmative({ type: "MULTI_SELECT" }, ["Mentor a student"])).toBe(true);
  });
});

describe("visibleQuestions", () => {
  const questions = [q(0, null), q(1, 0, "MULTI_SELECT"), q(2, null)];

  it("hides a follow-up until its parent is answered affirmatively", () => {
    expect(visibleQuestions(questions, {}).map((x) => x.id)).toEqual(["q0", "q2"]);
    expect(visibleQuestions(questions, { q0: "Not at present" }).map((x) => x.id)).toEqual(["q0", "q2"]);
    expect(visibleQuestions(questions, { q0: "Yes" }).map((x) => x.id)).toEqual(["q0", "q1", "q2"]);
  });

  it("keeps a follow-up of a hidden question hidden", () => {
    const chained = [q(0, null), q(1, 0), q(2, 1)];
    expect(visibleQuestions(chained, { q1: "Yes", q2: "Yes" }).map((x) => x.id)).toEqual(["q0"]);
  });
});
