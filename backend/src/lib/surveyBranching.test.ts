import { describe, expect, it } from "vitest";
import { isAffirmative, visibleQuestions } from "./surveyBranching.js";
import type { NormalizedAnswer } from "./surveySegments.js";

const blank: NormalizedAnswer = { value: null, textValue: null, scaleValue: null, selectedOptions: null };
const picked = (...options: string[]): NormalizedAnswer => ({ ...blank, selectedOptions: options });

const q = (position: number, dependsOnPosition: number | null, type = "SINGLE_SELECT") => ({
  id: `q${position}`, type, position, dependsOnPosition,
});

describe("isAffirmative", () => {
  it("treats degrees of willingness as affirmative", () => {
    for (const option of ["Yes", "Yes, subject to discussion", "Interested in exploring", "Maybe / Need more information"]) {
      expect(isAffirmative({ type: "SINGLE_SELECT" }, picked(option))).toBe(true);
    }
  });

  it("treats refusals as not affirmative", () => {
    for (const option of ["No", "Not at present", "Not interested"]) {
      expect(isAffirmative({ type: "SINGLE_SELECT" }, picked(option))).toBe(false);
    }
  });

  it("needs at least one non-refusal on a multi-select", () => {
    expect(isAffirmative({ type: "MULTI_SELECT" }, picked("Nothing right now"))).toBe(false);
    expect(isAffirmative({ type: "MULTI_SELECT" }, picked("Nothing right now", "Mentor a student"))).toBe(true);
  });

  it("is false when the parent hasn't been answered", () => {
    expect(isAffirmative({ type: "SINGLE_SELECT" }, undefined)).toBe(false);
  });
});

describe("visibleQuestions", () => {
  const questions = [q(0, null), q(1, 0, "MULTI_SELECT"), q(2, null), q(3, 2, "MULTI_SELECT")];

  it("hides follow-ups until their parent is answered", () => {
    expect(visibleQuestions(questions, new Map()).map((x) => x.id)).toEqual(["q0", "q2"]);
  });

  it("reveals only the follow-up whose parent was affirmative", () => {
    const answers = new Map([["q0", picked("Yes")], ["q2", picked("Not at present")]]);
    expect(visibleQuestions(questions, answers).map((x) => x.id)).toEqual(["q0", "q1", "q2"]);
  });

  it("keeps a follow-up of a hidden question hidden", () => {
    const chained = [q(0, null), q(1, 0), q(2, 1)];
    const answers = new Map([["q1", picked("Yes")], ["q2", picked("Yes")]]);
    expect(visibleQuestions(chained, answers).map((x) => x.id)).toEqual(["q0"]);
  });

  it("fails closed on a dependency cycle rather than recursing", () => {
    const cyclic = [q(0, 1), q(1, 0)];
    expect(visibleQuestions(cyclic, new Map([["q0", picked("Yes")], ["q1", picked("Yes")]]))).toEqual([]);
  });
});
