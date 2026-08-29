/**
 * Follow-up question gating.
 *
 * Several questions only make sense once the previous one was answered
 * affirmatively — there's no point asking which areas a respondent would like
 * capstone projects in when they've just said "Not at present". Each such
 * question stores the `position` of the question it follows up on, and is
 * hidden until that parent's answer reads as anything other than a refusal.
 *
 * The rule is deliberately "not negative" rather than "positive": the
 * questionnaire's options are degrees of willingness ("Yes, subject to
 * discussion", "Interested in exploring"), and anyone still exploring should
 * be asked what they'd explore.
 */
import type { NormalizedAnswer } from "./surveySegments.js";

export interface BranchingQuestion {
  id: string;
  type: string;
  position: number;
  dependsOnPosition: number | null;
}

/**
 * Whether an option's wording reads as a refusal. Deliberately its own rule
 * rather than `classifyOptionSentiment`: that one scores willingness for
 * analytics, and what counts as an engaged respondent shouldn't quietly
 * change which questions a guest is asked.
 */
export function isNegativeOption(option: string): boolean {
  const value = option.trim().toLowerCase();
  return value === "no" || value.startsWith("not ") || value.startsWith("nothing");
}

/** Whether an answer opens up the follow-ups hanging off its question. */
export function isAffirmative(question: { type: string }, answer: NormalizedAnswer | undefined): boolean {
  if (!answer) return false;
  switch (question.type) {
    case "YES_NO":
      return answer.value === true;
    case "SINGLE_SELECT": {
      const picked = answer.selectedOptions?.[0];
      return !!picked && !isNegativeOption(picked);
    }
    case "MULTI_SELECT":
      return (answer.selectedOptions ?? []).some((option) => !isNegativeOption(option));
    case "TEXT":
      return (answer.textValue ?? "").trim().length > 0;
    case "SCALE_1_5":
      return answer.scaleValue != null;
    default:
      return false;
  }
}

/**
 * The subset of `questions` a respondent should see, given what they've
 * answered so far. Gating chains: a follow-up of a hidden question stays
 * hidden, because its parent can't have been answered affirmatively.
 */
export function visibleQuestions<T extends BranchingQuestion>(
  questions: T[],
  answers: Map<string, NormalizedAnswer>,
): T[] {
  const byPosition = new Map(questions.map((q) => [q.position, q]));
  const shown = new Map<string, boolean>();
  const isShown = (question: T, seen: Set<number>): boolean => {
    const cached = shown.get(question.id);
    if (cached !== undefined) return cached;
    let result: boolean;
    if (question.dependsOnPosition == null) {
      result = true;
    } else if (seen.has(question.position)) {
      // A dependency cycle can only come from bad data; fail closed rather
      // than recurse forever, so the question simply never shows.
      result = false;
    } else {
      const parent = byPosition.get(question.dependsOnPosition);
      seen.add(question.position);
      result = !!parent && isShown(parent, seen) && isAffirmative(parent, answers.get(parent.id));
    }
    shown.set(question.id, result);
    return result;
  };
  return questions.filter((q) => isShown(q, new Set()));
}
