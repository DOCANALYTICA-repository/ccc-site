/**
 * Follow-up question gating — the client-side twin of the backend's
 * `surveyBranching.ts`, which enforces the same rule when a response is saved.
 *
 * Some questions only make sense once the one above them was answered
 * affirmatively: there's no point asking which areas a guest wants capstone
 * projects in right after they've said "Not at present". Those questions carry
 * the position of the question they follow up on, and stay hidden until its
 * answer reads as anything other than a refusal.
 *
 * "Not a refusal" rather than "a yes": the options are degrees of willingness
 * ("Yes, subject to discussion", "Interested in exploring"), and someone still
 * exploring should be asked what they'd like to explore.
 */
export interface BranchingQuestion {
  id: string;
  type: string;
  position: number;
  dependsOnPosition: number | null;
}

/** Whether an option's wording reads as a refusal. */
export function isNegativeOption(option: string): boolean {
  const value = option.trim().toLowerCase();
  return value === "no" || value.startsWith("not ") || value.startsWith("nothing");
}

/** Whether an answer opens up the follow-ups hanging off its question. */
export function isAffirmative(
  question: { type: string },
  value: boolean | string | string[] | number | undefined,
): boolean {
  if (value === undefined || value === null) return false;
  switch (question.type) {
    case "YES_NO":
      return value === true;
    case "SINGLE_SELECT":
      return typeof value === "string" && value.length > 0 && !isNegativeOption(value);
    case "MULTI_SELECT":
      return Array.isArray(value) && value.some((option) => !isNegativeOption(option));
    case "TEXT":
      return typeof value === "string" && value.trim().length > 0;
    case "SCALE_1_5":
      return typeof value === "number";
    default:
      return false;
  }
}

/**
 * The subset of `questions` to show, given the answers so far. Gating chains:
 * a follow-up of a hidden question stays hidden, since its parent can't have
 * been answered affirmatively.
 */
export function visibleQuestions<T extends BranchingQuestion>(
  questions: T[],
  answers: Record<string, boolean | string | string[] | number | undefined>,
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
      // Only reachable from bad data; fail closed rather than recurse forever.
      result = false;
    } else {
      const parent = byPosition.get(question.dependsOnPosition);
      seen.add(question.position);
      result = !!parent && isShown(parent, seen) && isAffirmative(parent, answers[parent.id]);
    }
    shown.set(question.id, result);
    return result;
  };
  return questions.filter((q) => isShown(q, new Set()));
}
