/** The catalogue of analytics charts that can be pinned to a dashboard.
 *
 * Both screens read from here: the analytics tab uses it to know what is
 * selectable, and the dashboard uses it to turn a stored `cardKey` back into a
 * title and a chart. Keeping one list means a chart can never appear in the
 * picker but fail to render on the dashboard.
 *
 * Derivations live here too, so the dashboard computes the same numbers from
 * the same analytics payload rather than duplicating the maths.
 */
import type { Analytics, QuestionReport, Respondent } from "./surveyAnalytics";
import { aggregateQuestion } from "./surveyAnalytics";

/** A chart's stable identity. Question charts are keyed by question id so they
 *  survive re-ordering; a key whose question no longer exists is skipped. */
export const QUESTION_CARD_PREFIX = "question:";

export function questionCardKey(questionId: string): string {
  return `${QUESTION_CARD_PREFIX}${questionId}`;
}

export function isQuestionCardKey(cardKey: string): boolean {
  return cardKey.startsWith(QUESTION_CARD_PREFIX);
}

export function questionIdFromCardKey(cardKey: string): string | null {
  return isQuestionCardKey(cardKey) ? cardKey.slice(QUESTION_CARD_PREFIX.length) : null;
}

/** Every non-question block that can be pinned, in the order the analytics
 *  page shows them. This is the source of truth for the picker.
 *
 * The written-answers block is deliberately absent: it reproduces free text
 * verbatim with names attached, which does not belong on a display board.
 * Pinning is for aggregate charts only. */
export const BLOCK_CARDS = [
  { key: "overview", title: "Overview", description: "Headline numbers and completion." },
  { key: "readiness", title: "Collaboration readiness", description: "Readiness bands and the 1-5 interest split." },
  { key: "demand", title: "Partnership demand", description: "Most-requested collaboration areas." },
  { key: "sections", title: "Section engagement", description: "Which parts of the form landed." },
  { key: "industry", title: "By industry", description: "How each sector responded." },
  { key: "role", title: "By role and seniority", description: "How each seniority band responded." },
  { key: "organisation", title: "By organisation", description: "Appetite per organisation." },
  { key: "leads", title: "Priority follow-ups", description: "Who to contact first." },
  { key: "contactability", title: "Contact preferences", description: "How respondents want to be reached." },
  { key: "timeline", title: "Submissions over time", description: "Uptake by day." },
] as const;

export type BlockCardKey = (typeof BLOCK_CARDS)[number]["key"];

export interface CardDescriptor {
  key: string;
  title: string;
  description: string;
}

/** Everything pinnable for one event: the fixed blocks, then one card per
 *  question that produces a chart. Free-text questions are excluded for the
 *  same reason the written-answers block is. */
export function availableCards(questions: QuestionReport[]): CardDescriptor[] {
  const questionCards = questions
    .filter((q) => q.type !== "TEXT")
    .map((q) => ({
      key: questionCardKey(q.id),
      title: q.prompt,
      description: q.section ?? "Question",
    }));
  return [...BLOCK_CARDS.map((c) => ({ key: c.key, title: c.title, description: c.description })), ...questionCards];
}

/** Resolves a stored key to its descriptor, or null when the key no longer
 *  names anything — a question deleted since it was pinned, say. */
export function findCard(cardKey: string, questions: QuestionReport[]): CardDescriptor | null {
  return availableCards(questions).find((c) => c.key === cardKey) ?? null;
}

/* ------------------------------------------------------------------ */
/* Derivations — shared so both screens compute identical numbers      */
/* ------------------------------------------------------------------ */

export function average(nums: number[]): number {
  return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;
}

export interface SegmentRow {
  segment: string;
  count: number;
  avgInterest: number;
  avgReadiness: number;
  wantsContact: number;
}

export function segmentRows(subset: Respondent[], getKey: (r: Respondent) => string): SegmentRow[] {
  const map = new Map<string, Respondent[]>();
  for (const r of subset) {
    const key = getKey(r);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map, ([segment, members]) => ({
    segment,
    count: members.length,
    avgInterest: average(members.map((m) => m.interest).filter((v): v is number => v != null)),
    avgReadiness: Math.round(average(members.map((m) => m.readiness))),
    wantsContact: members.filter((m) => m.wantsContact).length,
  }));
}

export function industryRows(subset: Respondent[]): SegmentRow[] {
  return segmentRows(subset, (r) => r.industry);
}
export function roleRows(subset: Respondent[]): SegmentRow[] {
  return segmentRows(subset, (r) => r.role);
}
export function organisationRows(subset: Respondent[]): SegmentRow[] {
  return segmentRows(subset, (r) => r.organization?.trim() || "Not recorded");
}

/** Every collaboration area opted into anywhere in the form, tallied.
 *  One area can appear in several questions, so a respondent may contribute
 *  more than one pick — counts are of picks, not of people. */
export function partnershipDemand(questions: QuestionReport[], subset: Respondent[]): Array<{ option: string; count: number }> {
  const tally = new Map<string, number>();
  for (const question of questions) {
    if (question.type !== "MULTI_SELECT") continue;
    for (const r of subset) {
      for (const picked of (r.answers[question.id] as string[] | null) ?? []) {
        if (picked === "Other") continue;
        tally.set(picked, (tally.get(picked) ?? 0) + 1);
      }
    }
  }
  return Array.from(tally, ([option, count]) => ({ option, count }));
}

export function readinessBands(subset: Respondent[]): Array<{ label: string; count: number }> {
  return [
    { label: "0-20", count: subset.filter((r) => r.readiness <= 20).length },
    { label: "21-40", count: subset.filter((r) => r.readiness > 20 && r.readiness <= 40).length },
    { label: "41-60", count: subset.filter((r) => r.readiness > 40 && r.readiness <= 60).length },
    { label: "61-80", count: subset.filter((r) => r.readiness > 60 && r.readiness <= 80).length },
    { label: "81-100", count: subset.filter((r) => r.readiness > 80).length },
  ];
}

export function submissionTimeline(subset: Respondent[]): Array<{ label: string; count: number }> {
  const tally = new Map<string, number>();
  for (const r of subset) {
    const day = r.submittedAt.slice(0, 10);
    tally.set(day, (tally.get(day) ?? 0) + 1);
  }
  return Array.from(tally, ([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label));
}

export function priorityLeads(subset: Respondent[]): Respondent[] {
  return subset
    .filter((r) => r.wantsContact || (r.interest ?? 0) >= 4 || r.readiness >= 70)
    .sort((a, b) => b.readiness - a.readiness);
}

export function contactModes(subset: Respondent[]): Array<{ label: string; count: number }> {
  const tally = new Map<string, number>();
  for (const r of subset) {
    if (!r.preferredContactMode) continue;
    tally.set(r.preferredContactMode, (tally.get(r.preferredContactMode) ?? 0) + 1);
  }
  return Array.from(tally, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

/** The aggregate behind one pinned question chart, or null if that question
 *  is no longer part of the survey. */
export function questionAggregateFor(cardKey: string, data: Analytics, subset: Respondent[]) {
  const questionId = questionIdFromCardKey(cardKey);
  if (!questionId) return null;
  const question = data.questions.find((q) => q.id === questionId);
  if (!question) return null;
  return { question, aggregate: aggregateQuestion(question, subset) };
}

/** How many dashboard pages a selection needs. */
export const CARDS_PER_PAGE = 6;

export function pageCount(cardCount: number): number {
  return Math.max(1, Math.ceil(cardCount / CARDS_PER_PAGE));
}

export function cardsForPage<T>(cards: T[], page: number): T[] {
  const start = (page - 1) * CARDS_PER_PAGE;
  return cards.slice(start, start + CARDS_PER_PAGE);
}

/** Tailwind grid classes that let a small selection fill the screen: one card
 *  goes full width, two sit side by side, and larger sets fall back to a
 *  two-column grid so nothing is squeezed into an unreadable column. */
export function gridClassFor(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 lg:grid-cols-2";
  if (count === 3) return "grid-cols-1 lg:grid-cols-3";
  return "grid-cols-1 lg:grid-cols-2";
}
