import { describe, expect, it } from "vitest";
import {
  classifyIndustry,
  classifyOptionSentiment,
  classifyRole,
  readinessScore,
  wordFrequencies,
  type NormalizedAnswer,
} from "./surveySegments.js";

describe("classifyIndustry", () => {
  it("buckets common organisation names", () => {
    expect(classifyIndustry("HDFC Bank Ltd")).toBe("Banking");
    expect(classifyIndustry("Bajaj Allianz General Insurance")).toBe("Insurance");
    expect(classifyIndustry("Infosys Technologies")).toBe("IT & Technology");
    expect(classifyIndustry("Tata Steel Manufacturing")).toBe("Manufacturing & Industrial");
    expect(classifyIndustry("Christ University")).toBe("Education & Academia");
  });

  it("prefers the more specific bucket when wording overlaps", () => {
    // "Investment bank" contains both an investment and a banking keyword;
    // banking is listed first so it wins.
    expect(classifyIndustry("Kotak Investment Banking")).toBe("Banking");
    // Audit rules run before consulting so a Big Four firm reads as audit.
    expect(classifyIndustry("KPMG Advisory Services")).toBe("Audit, Tax & Accounting");
  });

  it("lets an explicit contact tag override the name-based guess", () => {
    expect(classifyIndustry("Acme Pvt Ltd", ["Consulting"])).toBe("Consulting");
    // A tag that isn't a known industry is ignored rather than trusted blindly.
    expect(classifyIndustry("HDFC Bank Ltd", ["vip"])).toBe("Banking");
  });

  it("falls back to Other for blank or unrecognised names", () => {
    expect(classifyIndustry(null)).toBe("Other / Unclassified");
    expect(classifyIndustry("   ")).toBe("Other / Unclassified");
    expect(classifyIndustry("Zzyzx Holdings")).toBe("Other / Unclassified");
  });
});

describe("classifyRole", () => {
  it("buckets seniority from designations", () => {
    expect(classifyRole("Chief Financial Officer")).toBe("C-Suite");
    expect(classifyRole("Co-Founder & CEO")).toBe("Founder / Owner");
    expect(classifyRole("Vice President, Strategy")).toBe("VP / Director");
    expect(classifyRole("Head of Analytics")).toBe("Head / Lead");
    expect(classifyRole("Senior Manager")).toBe("Manager");
    expect(classifyRole("Business Analyst")).toBe("Analyst / Associate");
    expect(classifyRole("Professor of Finance")).toBe("Academic / Researcher");
  });

  it("falls back to Other when unknown or missing", () => {
    expect(classifyRole(null)).toBe("Other / Unclassified");
    expect(classifyRole("Chief Bottle Washer")).toBe("C-Suite"); // "chief" still wins
    expect(classifyRole("Zookeeper")).toBe("Other / Unclassified");
  });
});

describe("classifyOptionSentiment", () => {
  it("reads the questionnaire's willingness wording", () => {
    expect(classifyOptionSentiment("Yes, definitely")).toBe("positive");
    expect(classifyOptionSentiment("Both CSR & ESG")).toBe("positive");
    expect(classifyOptionSentiment("We currently offer internships")).toBe("positive");
    expect(classifyOptionSentiment("Interested in exploring")).toBe("exploring");
    expect(classifyOptionSentiment("Maybe / Need more information")).toBe("exploring");
    expect(classifyOptionSentiment("Not at present")).toBe("negative");
    expect(classifyOptionSentiment("No")).toBe("negative");
  });
});

describe("readinessScore", () => {
  const questions = [
    { id: "single", type: "SINGLE_SELECT", options: ["Yes", "Not at present"] },
    { id: "multi", type: "MULTI_SELECT", options: ["A", "B", "C", "D"] },
    { id: "scale", type: "SCALE_1_5", options: null },
    { id: "text", type: "TEXT", options: null },
  ];
  const answer = (partial: Partial<NormalizedAnswer>): NormalizedAnswer => ({
    value: null, textValue: null, scaleValue: null, selectedOptions: null, ...partial,
  });

  it("scores an enthusiastic respondent near 100", () => {
    const answers = new Map<string, NormalizedAnswer>([
      ["single", answer({ selectedOptions: ["Yes"] })],
      ["multi", answer({ selectedOptions: ["A", "B", "C"] })],
      ["scale", answer({ scaleValue: 5 })],
    ]);
    expect(readinessScore(questions, answers)).toBe(100);
  });

  it("scores a disengaged respondent at zero", () => {
    const answers = new Map<string, NormalizedAnswer>([
      ["single", answer({ selectedOptions: ["Not at present"] })],
      ["multi", answer({ selectedOptions: [] })],
      ["scale", answer({ scaleValue: 1 })],
    ]);
    expect(readinessScore(questions, answers)).toBe(0);
  });

  it("gives half credit for exploratory answers", () => {
    const answers = new Map<string, NormalizedAnswer>([
      ["single", answer({ selectedOptions: ["Interested in exploring"] })],
    ]);
    // 0.5 earned of 5 possible (1 single + 1 multi + 3 scale) = 10%.
    expect(readinessScore(questions, answers)).toBe(10);
  });

  it("ignores free-text questions and handles an empty questionnaire", () => {
    expect(readinessScore([{ id: "text", type: "TEXT", options: null }], new Map())).toBe(0);
    expect(readinessScore([], new Map())).toBe(0);
  });
});

describe("wordFrequencies", () => {
  it("ranks meaningful words and drops stopwords", () => {
    const result = wordFrequencies([
      "We would like analytics training for our finance team",
      "Analytics and finance analytics are the priority",
    ], 3);
    expect(result[0]).toEqual({ word: "analytics", count: 3 });
    expect(result.map((r) => r.word)).not.toContain("the");
    expect(result.map((r) => r.word)).not.toContain("and");
  });

  it("returns nothing for empty input", () => {
    expect(wordFrequencies([])).toEqual([]);
  });
});
