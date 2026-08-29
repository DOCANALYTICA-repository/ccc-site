/** Types and pure helpers for the questionnaire analytics screen.
 *
 * Filtering, sorting and searching all happen client-side against the single
 * payload from GET /surveys/events/:id/analytics — the guest list bounds the
 * dataset, so re-fetching on every filter change would cost more than it saves.
 */

export type QuestionType = "YES_NO" | "SINGLE_SELECT" | "MULTI_SELECT" | "TEXT" | "SCALE_1_5";

export type AnswerValue = boolean | string | string[] | number | null;

export interface Respondent {
  responseId: string;
  invitationId: string;
  contactId: string;
  name: string;
  organization: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
  profileUrl: string | null;
  tags: string[];
  submittedAt: string;
  industry: string;
  role: string;
  interest: number | null;
  readiness: number;
  wantsContact: boolean;
  preferredContactMode: string | null;
  /** Seating from the event's grouping sheet; null for anyone not on it. */
  tableNumber: number | null;
  tableLabel: string | null;
  programmeFocus: string | null;
  seniorityBand: string | null;
  answers: Record<string, AnswerValue>;
}

export interface QuestionAggregate {
  id: string;
  prompt: string;
  type: QuestionType;
  section: string | null;
  options: string[] | null;
  responded?: number;
  yes?: number;
  no?: number;
  counts?: Array<{ option: string; count: number }>;
  distribution?: Array<{ value: number; count: number }>;
  average?: number;
  responses?: Array<{ respondentId: string; name: string; organization: string | null; text: string }>;
  words?: Array<{ word: string; count: number }>;
}

export interface QuestionReport extends QuestionAggregate {
  breakdowns: {
    byIndustry: Array<QuestionAggregate & { segment: string; total: number }>;
    byRole: Array<QuestionAggregate & { segment: string; total: number }>;
    byTable: Array<QuestionAggregate & { segment: string; total: number }>;
    byProgramme: Array<QuestionAggregate & { segment: string; total: number }>;
  };
}

export interface SegmentSummary {
  segment: string;
  respondents: number;
  avgInterest: number;
  avgReadiness: number;
  wantsContact: number;
  topInterests?: Array<{ option: string; count: number }>;
}

export interface Analytics {
  survey: { id: string; title: string; status: "DRAFT" | "OPEN" | "CLOSED"; openedAt: string | null; closedAt: string | null };
  completion: { arrived: number; submitted: number; outstanding: number; rate: number };
  headline: { avgInterest: number; avgReadiness: number; wantsContact: number; organisations: number; industries: number; roles: number };
  questions: QuestionReport[];
  segments: {
    industries: SegmentSummary[];
    roles: SegmentSummary[];
    organisations: SegmentSummary[];
    tables: SegmentSummary[];
    programmes: SegmentSummary[];
  };
  derived: {
    sectionEngagement: Array<{ section: string; score: number; questions: number }>;
    partnershipDemand: Array<{ option: string; count: number }>;
    hotLeads: Array<{
      responseId: string; name: string; organization: string | null; designation: string | null;
      email: string | null; phone: string | null; industry: string; role: string;
      interest: number | null; readiness: number; wantsContact: boolean; preferredContactMode: string | null;
    }>;
    timeline: Array<{ day: string; count: number }>;
    /** Every table on the seating plan, including ones nobody answered from. */
    tableParticipation: Array<{
      tableLabel: string;
      tableNumber: number;
      programmeFocus: string | null;
      seated: number;
      responded: number;
      rate: number;
      avgInterest: number;
      avgReadiness: number;
      wantsContact: number;
      topInterests: Array<{ option: string; count: number }>;
    }>;
  };
  respondents: Respondent[];
  readinessDistribution: Array<{ band: string; count: number }>;
}

export interface Filters {
  industries: string[];
  roles: string[];
  organisations: string[];
  tables: string[];
  programmes: string[];
  minInterest: number;
  wantsContactOnly: boolean;
  text: string;
}

export const EMPTY_FILTERS: Filters = {
  industries: [],
  roles: [],
  organisations: [],
  tables: [],
  programmes: [],
  minInterest: 0,
  wantsContactOnly: false,
  text: "",
};

export function activeFilterCount(filters: Filters): number {
  return (
    filters.industries.length +
    filters.roles.length +
    filters.organisations.length +
    filters.tables.length +
    filters.programmes.length +
    (filters.minInterest > 0 ? 1 : 0) +
    (filters.wantsContactOnly ? 1 : 0) +
    (filters.text.trim() ? 1 : 0)
  );
}

/** Narrows the respondent list to those matching every active filter. */
export function applyFilters(respondents: Respondent[], filters: Filters): Respondent[] {
  const needle = filters.text.trim().toLowerCase();
  return respondents.filter((r) => {
    if (filters.industries.length && !filters.industries.includes(r.industry)) return false;
    if (filters.roles.length && !filters.roles.includes(r.role)) return false;
    if (filters.organisations.length && !filters.organisations.includes(r.organization?.trim() || "Not recorded")) return false;
    if (filters.tables.length && !filters.tables.includes(r.tableLabel ?? "Not seated")) return false;
    if (filters.programmes.length && !filters.programmes.includes(r.programmeFocus ?? "Not recorded")) return false;
    if (filters.minInterest > 0 && (r.interest ?? 0) < filters.minInterest) return false;
    if (filters.wantsContactOnly && !r.wantsContact) return false;
    if (needle) {
      const haystack = [r.name, r.organization, r.designation, r.email, r.industry, r.role, r.tableLabel, r.programmeFocus, ...r.tags]
        .filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export type RespondentSort =
  | "readiness-desc" | "readiness-asc"
  | "interest-desc" | "interest-asc"
  | "name-asc" | "organisation-asc"
  | "submitted-desc" | "submitted-asc";

export const RESPONDENT_SORTS: Array<{ value: RespondentSort; label: string }> = [
  { value: "readiness-desc", label: "Readiness (high → low)" },
  { value: "readiness-asc", label: "Readiness (low → high)" },
  { value: "interest-desc", label: "Interest (high → low)" },
  { value: "interest-asc", label: "Interest (low → high)" },
  { value: "name-asc", label: "Name (A → Z)" },
  { value: "organisation-asc", label: "Organisation (A → Z)" },
  { value: "submitted-desc", label: "Newest submission" },
  { value: "submitted-asc", label: "Oldest submission" },
];

export function sortRespondents(respondents: Respondent[], sort: RespondentSort): Respondent[] {
  const copy = [...respondents];
  const byName = (a: Respondent, b: Respondent) => a.name.localeCompare(b.name);
  switch (sort) {
    case "readiness-desc": return copy.sort((a, b) => b.readiness - a.readiness || byName(a, b));
    case "readiness-asc": return copy.sort((a, b) => a.readiness - b.readiness || byName(a, b));
    case "interest-desc": return copy.sort((a, b) => (b.interest ?? -1) - (a.interest ?? -1) || byName(a, b));
    case "interest-asc": return copy.sort((a, b) => (a.interest ?? 99) - (b.interest ?? 99) || byName(a, b));
    case "organisation-asc": return copy.sort((a, b) => (a.organization ?? "").localeCompare(b.organization ?? "") || byName(a, b));
    case "submitted-desc": return copy.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    case "submitted-asc": return copy.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    default: return copy.sort(byName);
  }
}

export type CountSort = "count-desc" | "count-asc" | "label-asc";

export const COUNT_SORTS: Array<{ value: CountSort; label: string }> = [
  { value: "count-desc", label: "Most first" },
  { value: "count-asc", label: "Fewest first" },
  { value: "label-asc", label: "A → Z" },
];

export function sortCounts<T extends { count: number }>(items: T[], sort: CountSort, labelOf: (item: T) => string): T[] {
  const copy = [...items];
  if (sort === "count-desc") return copy.sort((a, b) => b.count - a.count || labelOf(a).localeCompare(labelOf(b)));
  if (sort === "count-asc") return copy.sort((a, b) => a.count - b.count || labelOf(a).localeCompare(labelOf(b)));
  return copy.sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
}

/** True when a block's heading and its searchable text match the query.
 * An empty query matches everything, so search starts fully expanded. */
export function matchesSearch(query: string, ...haystack: Array<string | null | undefined>): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const terms = needle.split(/\s+/);
  const text = haystack.filter(Boolean).join(" ").toLowerCase();
  return terms.every((term) => text.includes(term));
}

/** Recomputes one question's aggregate from an arbitrary respondent subset,
 * so every chart honours the active filters without another server call. */
export function aggregateQuestion(question: QuestionReport, subset: Respondent[]): QuestionAggregate {
  const base: QuestionAggregate = {
    id: question.id, prompt: question.prompt, type: question.type,
    section: question.section, options: question.options,
  };
  const values = subset.map((r) => r.answers[question.id]).filter((v) => v !== null && v !== undefined);
  if (question.type === "YES_NO") {
    return { ...base, yes: values.filter((v) => v === true).length, no: values.filter((v) => v === false).length, responded: values.length };
  }
  if (question.type === "SINGLE_SELECT" || question.type === "MULTI_SELECT") {
    const tally = new Map<string, number>();
    for (const option of question.options ?? []) tally.set(option, 0);
    for (const value of values) {
      for (const picked of Array.isArray(value) ? value : [value as string]) {
        tally.set(picked, (tally.get(picked) ?? 0) + 1);
      }
    }
    return { ...base, counts: Array.from(tally, ([option, count]) => ({ option, count })), responded: values.length };
  }
  if (question.type === "SCALE_1_5") {
    const scales = values.filter((v): v is number => typeof v === "number");
    return {
      ...base,
      distribution: [1, 2, 3, 4, 5].map((n) => ({ value: n, count: scales.filter((v) => v === n).length })),
      average: scales.length ? scales.reduce((sum, v) => sum + v, 0) / scales.length : 0,
      responded: scales.length,
    };
  }
  return {
    ...base,
    responses: subset
      .filter((r) => typeof r.answers[question.id] === "string" && (r.answers[question.id] as string).trim())
      .map((r) => ({ respondentId: r.responseId, name: r.name, organization: r.organization, text: r.answers[question.id] as string })),
    responded: values.length,
  };
}

/** Renders any answer value as display text. */
export function formatAnswer(value: AnswerValue): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}

/** Groups a flat question list into sections, preserving first-seen order. */
export function groupBySection<T extends { section: string | null }>(items: T[]): Array<{ section: string; items: T[] }> {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.section ?? "Ungrouped";
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(item);
  }
  return order.map((section) => ({ section, items: map.get(section)! }));
}
