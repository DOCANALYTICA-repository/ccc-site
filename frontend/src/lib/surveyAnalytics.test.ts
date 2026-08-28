import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  aggregateQuestion,
  applyFilters,
  EMPTY_FILTERS,
  formatAnswer,
  groupBySection,
  matchesSearch,
  sortCounts,
  sortRespondents,
  type QuestionReport,
  type Respondent,
} from "./surveyAnalytics";

function respondent(partial: Partial<Respondent>): Respondent {
  return {
    responseId: "r1", invitationId: "i1", contactId: "c1",
    name: "Asha Rao", organization: "HDFC Bank", designation: "Head of Retail",
    email: "asha@example.com", phone: null, profileUrl: null, tags: [],
    submittedAt: "2026-08-01T10:00:00.000Z",
    industry: "Banking", role: "Head / Lead",
    interest: 4, readiness: 70, wantsContact: true, preferredContactMode: "Email",
    answers: {},
    ...partial,
  };
}

const people = [
  respondent({ responseId: "a", name: "Asha Rao", industry: "Banking", role: "Head / Lead", interest: 5, readiness: 90, wantsContact: true, organization: "HDFC Bank" }),
  respondent({ responseId: "b", name: "Bala Iyer", industry: "Consulting", role: "C-Suite", interest: 2, readiness: 30, wantsContact: false, organization: "Acme Advisory", submittedAt: "2026-08-03T10:00:00.000Z" }),
  respondent({ responseId: "c", name: "Chitra Nair", industry: "Banking", role: "Manager", interest: null, readiness: 55, wantsContact: false, organization: null, submittedAt: "2026-08-02T10:00:00.000Z" }),
];

describe("applyFilters", () => {
  it("returns everything when no filter is set", () => {
    expect(applyFilters(people, EMPTY_FILTERS)).toHaveLength(3);
  });

  it("filters by industry, role and organisation", () => {
    expect(applyFilters(people, { ...EMPTY_FILTERS, industries: ["Banking"] }).map((r) => r.responseId)).toEqual(["a", "c"]);
    expect(applyFilters(people, { ...EMPTY_FILTERS, roles: ["C-Suite"] }).map((r) => r.responseId)).toEqual(["b"]);
    // A respondent with no organisation is matchable under the "Not recorded" bucket.
    expect(applyFilters(people, { ...EMPTY_FILTERS, organisations: ["Not recorded"] }).map((r) => r.responseId)).toEqual(["c"]);
  });

  it("treats a missing interest rating as below any minimum", () => {
    expect(applyFilters(people, { ...EMPTY_FILTERS, minInterest: 3 }).map((r) => r.responseId)).toEqual(["a"]);
  });

  it("filters to contact-requesting respondents", () => {
    expect(applyFilters(people, { ...EMPTY_FILTERS, wantsContactOnly: true }).map((r) => r.responseId)).toEqual(["a"]);
  });

  it("free-text searches across name, org, role and industry", () => {
    expect(applyFilters(people, { ...EMPTY_FILTERS, text: "hdfc" }).map((r) => r.responseId)).toEqual(["a"]);
    expect(applyFilters(people, { ...EMPTY_FILTERS, text: "consulting" }).map((r) => r.responseId)).toEqual(["b"]);
    expect(applyFilters(people, { ...EMPTY_FILTERS, text: "nobody" })).toHaveLength(0);
  });

  it("combines filters with AND", () => {
    const result = applyFilters(people, { ...EMPTY_FILTERS, industries: ["Banking"], wantsContactOnly: true });
    expect(result.map((r) => r.responseId)).toEqual(["a"]);
  });
});

describe("activeFilterCount", () => {
  it("counts each active dimension once", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, industries: ["Banking", "Consulting"], minInterest: 3, text: " " })).toBe(3);
  });
});

describe("sortRespondents", () => {
  it("sorts by readiness, interest, name and submission time", () => {
    expect(sortRespondents(people, "readiness-desc").map((r) => r.responseId)).toEqual(["a", "c", "b"]);
    expect(sortRespondents(people, "readiness-asc").map((r) => r.responseId)).toEqual(["b", "c", "a"]);
    // A null interest sorts last descending, not as a zero in the middle.
    expect(sortRespondents(people, "interest-desc").map((r) => r.responseId)).toEqual(["a", "b", "c"]);
    expect(sortRespondents(people, "name-asc").map((r) => r.responseId)).toEqual(["a", "b", "c"]);
    expect(sortRespondents(people, "submitted-desc").map((r) => r.responseId)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const original = [...people];
    sortRespondents(people, "readiness-asc");
    expect(people).toEqual(original);
  });
});

describe("sortCounts", () => {
  const items = [{ option: "B", count: 2 }, { option: "A", count: 2 }, { option: "C", count: 5 }];
  it("orders by count then label", () => {
    expect(sortCounts(items, "count-desc", (i) => i.option).map((i) => i.option)).toEqual(["C", "A", "B"]);
    expect(sortCounts(items, "count-asc", (i) => i.option).map((i) => i.option)).toEqual(["A", "B", "C"]);
    expect(sortCounts(items, "label-asc", (i) => i.option).map((i) => i.option)).toEqual(["A", "B", "C"]);
  });
});

describe("matchesSearch", () => {
  it("matches everything on an empty query", () => {
    expect(matchesSearch("", "anything")).toBe(true);
    expect(matchesSearch("   ", null)).toBe(true);
  });

  it("requires every term to appear somewhere in the haystack", () => {
    expect(matchesSearch("capstone project", "Capstone Projects", "Experiential Learning")).toBe(true);
    expect(matchesSearch("capstone finance", "Capstone Projects", "Experiential Learning")).toBe(false);
    expect(matchesSearch("CAPSTONE", "capstone projects")).toBe(true);
  });
});

describe("aggregateQuestion", () => {
  const question = (partial: Partial<QuestionReport>): QuestionReport => ({
    id: "q", prompt: "Prompt", type: "SINGLE_SELECT", section: "S", options: ["Yes", "No"],
    breakdowns: { byIndustry: [], byRole: [] },
    ...partial,
  });

  it("tallies single-select answers and keeps zero-count options visible", () => {
    const q = question({});
    const subset = [respondent({ answers: { q: "Yes" } }), respondent({ answers: { q: "Yes" } })];
    const result = aggregateQuestion(q, subset);
    expect(result.counts).toEqual([{ option: "Yes", count: 2 }, { option: "No", count: 0 }]);
    expect(result.responded).toBe(2);
  });

  it("counts every pick of a multi-select", () => {
    const q = question({ type: "MULTI_SELECT", options: ["A", "B", "C"] });
    const subset = [respondent({ answers: { q: ["A", "B"] } }), respondent({ answers: { q: ["B"] } })];
    const result = aggregateQuestion(q, subset);
    expect(result.counts).toEqual([{ option: "A", count: 1 }, { option: "B", count: 2 }, { option: "C", count: 0 }]);
  });

  it("averages a 1-5 scale and builds its distribution", () => {
    const q = question({ type: "SCALE_1_5", options: null });
    const subset = [respondent({ answers: { q: 5 } }), respondent({ answers: { q: 3 } })];
    const result = aggregateQuestion(q, subset);
    expect(result.average).toBe(4);
    expect(result.distribution?.find((d) => d.value === 5)?.count).toBe(1);
  });

  it("splits yes/no and ignores unanswered questions", () => {
    const q = question({ type: "YES_NO", options: null });
    const subset = [respondent({ answers: { q: true } }), respondent({ answers: { q: false } }), respondent({ answers: { q: null } })];
    const result = aggregateQuestion(q, subset);
    expect(result).toMatchObject({ yes: 1, no: 1, responded: 2 });
  });

  it("collects attributed free-text answers, skipping blanks", () => {
    const q = question({ type: "TEXT", options: null });
    const subset = [
      respondent({ name: "Asha Rao", answers: { q: "More analytics please" } }),
      respondent({ name: "Bala Iyer", answers: { q: "   " } }),
    ];
    const result = aggregateQuestion(q, subset);
    expect(result.responses).toEqual([
      { respondentId: "r1", name: "Asha Rao", organization: "HDFC Bank", text: "More analytics please" },
    ]);
  });

  it("returns empty aggregates for an empty subset", () => {
    expect(aggregateQuestion(question({}), [])).toMatchObject({ responded: 0 });
    expect(aggregateQuestion(question({ type: "SCALE_1_5", options: null }), [])).toMatchObject({ average: 0 });
  });
});

describe("formatAnswer", () => {
  it("renders every answer shape", () => {
    expect(formatAnswer(true)).toBe("Yes");
    expect(formatAnswer(false)).toBe("No");
    expect(formatAnswer(4)).toBe("4");
    expect(formatAnswer(["A", "B"])).toBe("A, B");
    expect(formatAnswer([])).toBe("—");
    expect(formatAnswer(null)).toBe("—");
    expect(formatAnswer("free text")).toBe("free text");
  });
});

describe("groupBySection", () => {
  it("preserves first-seen section order and buckets nulls", () => {
    const grouped = groupBySection([
      { section: "B", id: 1 }, { section: "A", id: 2 }, { section: "B", id: 3 }, { section: null, id: 4 },
    ]);
    expect(grouped.map((g) => g.section)).toEqual(["B", "A", "Ungrouped"]);
    expect(grouped[0].items).toHaveLength(2);
  });
});
