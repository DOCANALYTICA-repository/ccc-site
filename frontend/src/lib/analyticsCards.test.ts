import { describe, expect, it } from "vitest";
import {
  availableCards,
  BLOCK_CARDS,
  CARDS_PER_PAGE,
  cardsForPage,
  contactModes,
  findCard,
  gridClassFor,
  industryRows,
  isQuestionCardKey,
  organisationRows,
  pageCount,
  partnershipDemand,
  priorityLeads,
  questionAggregateFor,
  questionCardKey,
  questionIdFromCardKey,
  readinessBands,
  submissionTimeline,
} from "./analyticsCards";
import type { Analytics, QuestionReport, Respondent } from "./surveyAnalytics";

function respondent(partial: Partial<Respondent>): Respondent {
  return {
    responseId: "r1", invitationId: "i1", contactId: "c1",
    name: "Asha Rao", organization: "HDFC Bank", designation: "Head of Retail",
    email: null, phone: null, profileUrl: null, tags: [],
    submittedAt: "2026-08-01T10:00:00.000Z",
    industry: "Banking", role: "Head / Lead",
    interest: 4, readiness: 70, wantsContact: false, preferredContactMode: null,
    answers: {},
    ...partial,
  };
}

function question(partial: Partial<QuestionReport>): QuestionReport {
  return {
    id: "q1", prompt: "Prompt", type: "MULTI_SELECT", section: "S", options: ["A", "B"],
    breakdowns: { byIndustry: [], byRole: [] },
    ...partial,
  };
}

describe("card keys", () => {
  it("round-trips a question id", () => {
    const key = questionCardKey("abc-123");
    expect(isQuestionCardKey(key)).toBe(true);
    expect(questionIdFromCardKey(key)).toBe("abc-123");
  });

  it("does not treat a block key as a question", () => {
    expect(isQuestionCardKey("industry")).toBe(false);
    expect(questionIdFromCardKey("industry")).toBeNull();
  });
});

describe("availableCards", () => {
  it("lists every block plus one card per chartable question", () => {
    const cards = availableCards([
      question({ id: "q1", type: "MULTI_SELECT" }),
      question({ id: "q2", type: "SCALE_1_5", options: null }),
    ]);
    expect(cards).toHaveLength(BLOCK_CARDS.length + 2);
    expect(cards.some((c) => c.key === questionCardKey("q1"))).toBe(true);
  });

  it("excludes free-text questions, which would put verbatim answers on a display", () => {
    const cards = availableCards([question({ id: "qt", type: "TEXT", options: null })]);
    expect(cards.some((c) => c.key === questionCardKey("qt"))).toBe(false);
    expect(cards).toHaveLength(BLOCK_CARDS.length);
  });

  it("never offers the written-answers block", () => {
    expect(BLOCK_CARDS.some((c) => c.key === "text")).toBe(false);
  });
});

describe("findCard", () => {
  const questions = [question({ id: "q1", prompt: "Preferred areas" })];

  it("resolves block and question keys", () => {
    expect(findCard("industry", questions)?.title).toBe("By industry");
    expect(findCard(questionCardKey("q1"), questions)?.title).toBe("Preferred areas");
  });

  it("returns null for a key that no longer names anything", () => {
    // A question pinned and later deleted from the template.
    expect(findCard(questionCardKey("gone"), questions)).toBeNull();
    expect(findCard("not-a-block", questions)).toBeNull();
  });
});

describe("pagination", () => {
  it("always reports at least one page, even with nothing pinned", () => {
    expect(pageCount(0)).toBe(1);
  });

  it("adds a page once the per-page limit is passed", () => {
    expect(pageCount(CARDS_PER_PAGE)).toBe(1);
    expect(pageCount(CARDS_PER_PAGE + 1)).toBe(2);
    expect(pageCount(CARDS_PER_PAGE * 2 + 1)).toBe(3);
  });

  it("slices the right cards per page", () => {
    const cards = Array.from({ length: 8 }, (_, i) => i);
    expect(cardsForPage(cards, 1)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(cardsForPage(cards, 2)).toEqual([6, 7]);
    // A page past the end is empty rather than throwing.
    expect(cardsForPage(cards, 3)).toEqual([]);
  });
});

describe("gridClassFor", () => {
  it("gives a lone card the full width and pairs two side by side", () => {
    expect(gridClassFor(1)).toBe("grid-cols-1");
    expect(gridClassFor(2)).toContain("lg:grid-cols-2");
    expect(gridClassFor(3)).toContain("lg:grid-cols-3");
  });

  it("falls back to two columns rather than squeezing many into one row", () => {
    expect(gridClassFor(6)).toContain("lg:grid-cols-2");
  });

  it("handles an empty selection without breaking", () => {
    expect(gridClassFor(0)).toBe("grid-cols-1");
  });
});

describe("segment derivations", () => {
  const people = [
    respondent({ industry: "Banking", role: "C-Suite", organization: "HDFC", interest: 5, readiness: 90, wantsContact: true }),
    respondent({ industry: "Banking", role: "Manager", organization: "HDFC", interest: 3, readiness: 50 }),
    respondent({ industry: "Consulting", role: "C-Suite", organization: null, interest: null, readiness: 20 }),
  ];

  it("groups by industry with averages and follow-up counts", () => {
    const rows = industryRows(people);
    const banking = rows.find((r) => r.segment === "Banking")!;
    expect(banking.count).toBe(2);
    expect(banking.avgInterest).toBe(4);
    expect(banking.avgReadiness).toBe(70);
    expect(banking.wantsContact).toBe(1);
  });

  it("buckets a missing organisation rather than dropping the respondent", () => {
    const rows = organisationRows(people);
    expect(rows.find((r) => r.segment === "Not recorded")?.count).toBe(1);
  });

  it("ignores a null interest when averaging instead of counting it as zero", () => {
    const consulting = industryRows(people).find((r) => r.segment === "Consulting")!;
    expect(consulting.avgInterest).toBe(0); // no ratings at all -> 0, not NaN
    expect(Number.isNaN(consulting.avgInterest)).toBe(false);
  });

  it("returns nothing for an empty subset", () => {
    expect(industryRows([])).toEqual([]);
  });
});

describe("partnershipDemand", () => {
  it("counts picks across every multi-select and skips Other", () => {
    const questions = [
      question({ id: "q1", type: "MULTI_SELECT" }),
      question({ id: "q2", type: "MULTI_SELECT" }),
      question({ id: "q3", type: "SCALE_1_5", options: null }),
    ];
    const people = [
      respondent({ answers: { q1: ["Finance", "Other"], q2: ["Finance"], q3: 5 } }),
      respondent({ answers: { q1: ["Banking"], q2: null } }),
    ];
    const demand = partnershipDemand(questions, people);
    // Finance is picked in two different questions by one person.
    expect(demand.find((d) => d.option === "Finance")?.count).toBe(2);
    expect(demand.find((d) => d.option === "Banking")?.count).toBe(1);
    expect(demand.some((d) => d.option === "Other")).toBe(false);
  });

  it("is empty when nothing has been selected", () => {
    expect(partnershipDemand([question({})], [])).toEqual([]);
  });
});

describe("readinessBands", () => {
  it("puts each score in exactly one band", () => {
    const people = [0, 20, 21, 40, 41, 60, 61, 80, 81, 100].map((readiness) => respondent({ readiness }));
    const bands = readinessBands(people);
    expect(bands.reduce((sum, b) => sum + b.count, 0)).toBe(people.length);
    expect(bands.find((b) => b.label === "0-20")?.count).toBe(2);
    expect(bands.find((b) => b.label === "81-100")?.count).toBe(2);
  });
});

describe("submissionTimeline", () => {
  it("tallies by day in chronological order", () => {
    const people = [
      respondent({ submittedAt: "2026-08-03T10:00:00.000Z" }),
      respondent({ submittedAt: "2026-08-01T09:00:00.000Z" }),
      respondent({ submittedAt: "2026-08-01T18:00:00.000Z" }),
    ];
    expect(submissionTimeline(people)).toEqual([
      { label: "2026-08-01", count: 2 },
      { label: "2026-08-03", count: 1 },
    ]);
  });
});

describe("priorityLeads", () => {
  it("includes anyone who asked for contact, rated 4+, or scored 70+", () => {
    const people = [
      respondent({ responseId: "a", wantsContact: true, interest: 1, readiness: 10 }),
      respondent({ responseId: "b", wantsContact: false, interest: 4, readiness: 10 }),
      respondent({ responseId: "c", wantsContact: false, interest: 1, readiness: 75 }),
      respondent({ responseId: "d", wantsContact: false, interest: 1, readiness: 10 }),
    ];
    expect(priorityLeads(people).map((r) => r.responseId).sort()).toEqual(["a", "b", "c"]);
  });

  it("sorts by readiness descending", () => {
    const people = [
      respondent({ responseId: "low", wantsContact: true, readiness: 30 }),
      respondent({ responseId: "high", wantsContact: true, readiness: 95 }),
    ];
    expect(priorityLeads(people)[0].responseId).toBe("high");
  });
});

describe("contactModes", () => {
  it("tallies preferences and skips respondents with none", () => {
    const people = [
      respondent({ preferredContactMode: "Email" }),
      respondent({ preferredContactMode: "Email" }),
      respondent({ preferredContactMode: "Phone" }),
      respondent({ preferredContactMode: null }),
    ];
    expect(contactModes(people)).toEqual([
      { label: "Email", count: 2 },
      { label: "Phone", count: 1 },
    ]);
  });
});

describe("questionAggregateFor", () => {
  const data = {
    questions: [question({ id: "q1", type: "SINGLE_SELECT", options: ["Yes", "No"] })],
  } as unknown as Analytics;

  it("aggregates the named question over the subset", () => {
    const people = [respondent({ answers: { q1: "Yes" } }), respondent({ answers: { q1: "Yes" } })];
    const result = questionAggregateFor(questionCardKey("q1"), data, people);
    expect(result?.aggregate.counts).toEqual([{ option: "Yes", count: 2 }, { option: "No", count: 0 }]);
  });

  it("returns null for a block key or a question that no longer exists", () => {
    expect(questionAggregateFor("industry", data, [])).toBeNull();
    expect(questionAggregateFor(questionCardKey("missing"), data, [])).toBeNull();
  });
});
