/**
 * Segmentation helpers for questionnaire analytics.
 *
 * The Corporate–Academia questionnaire deliberately does NOT ask respondents
 * for their industry or designation — that data already lives on the Contact
 * record we invited them from, so asking again would be redundant and would
 * only be answered by people who bothered to fill section 1. Classifying the
 * contact's free-text `organization` / `designation` instead means every
 * respondent lands in a segment, including ones who skipped optional fields.
 *
 * Both classifiers are keyword-based and deliberately order-sensitive: the
 * first matching bucket wins, so more specific buckets are listed before
 * broader ones (e.g. "investment bank" should read as Banking, not Consulting).
 */

export const INDUSTRY_SEGMENTS = [
  "Banking",
  "Financial Services & Investment",
  "Insurance",
  "Audit, Tax & Accounting",
  "Consulting",
  "IT & Technology",
  "Analytics & Data",
  "Manufacturing & Industrial",
  "FMCG & Retail",
  "Healthcare & Pharma",
  "Education & Academia",
  "Government & Public Sector",
  "Non-profit & Development",
  "Media & Marketing",
  "Real Estate & Infrastructure",
  "Energy & Utilities",
  "Logistics & Transport",
  "Hospitality & Travel",
  "Other / Unclassified",
] as const;

export type IndustrySegment = (typeof INDUSTRY_SEGMENTS)[number];

const INDUSTRY_RULES: Array<{ segment: IndustrySegment; keywords: string[] }> = [
  { segment: "Audit, Tax & Accounting", keywords: ["chartered accountant", "audit", "taxation", "accounting", "accountants", " ca ", "deloitte", "kpmg", "pwc", "ernst", "grant thornton", "bdo", " ey ", "young"] },
  { segment: "Banking", keywords: ["bank", "banking", "nbfc", "credit union", "hdfc", "icici", "axis", "kotak", "sbi", "yes bank", "federal bank",
      "jp morgan", "jpmorgan", "state street", "bnp", "paribas", "paribus", "goldman", "morgan stanley", "citi"] },
  { segment: "Insurance", keywords: ["insurance", "assurance", "life insur", "general insur", "reinsur", "actuar"] },
  { segment: "Financial Services & Investment", keywords: ["capital", "invest", "asset management", "wealth", "securities", "broking", "brokerage", "mutual fund", "private equity", "venture", "financial services", "fintech", "treasury", "hedge fund", "finsol", "finserv"] },
  { segment: "Analytics & Data", keywords: ["analytics", "data science", "big data", "business intelligence", "insights", "market research", "metrics"] },
  { segment: "Consulting", keywords: ["consult", "advisory", "advisors", "strategy partners", "mckinsey", "bain", "bcg", "accenture", "lawyer", "legal", " law "] },
  { segment: "IT & Technology", keywords: ["technolog", "software", "infotech", "it services", "systems", "digital", "cyber", "cloud", "saas", "tcs", "infosys", "wipro", "cognizant", "hcl", "tech mahindra", "microsoft", "google", "amazon", "ibm", "oracle", "sap",
      "salesforce", "synopsys", "synechron", "atos", "capgemini", "mphasis", "cadsoft", "sage", "zeiss", "novometrics"] },
  { segment: "Healthcare & Pharma", keywords: ["hospital", "health", "pharma", "biotech", "medical", "clinic", "diagnostic", "life sciences"] },
  { segment: "Education & Academia", keywords: ["university", "college", "school", "institute", "academy", "education", "edtech", "iim", "iit", "nit"] },
  { segment: "Government & Public Sector", keywords: ["government", "ministry", "municipal", "public sector", "psu", "corporation of india", "authority", "commission", "council of india", "rbi", "sebi", "irdai"] },
  { segment: "Non-profit & Development", keywords: ["foundation", "trust", "ngo", "non-profit", "nonprofit", "charitable", "society for", "development society", "welfare"] },
  { segment: "Media & Marketing", keywords: ["media", "advertis", "marketing", "communications", "public relations", "brand", "publishing", "broadcast"] },
  { segment: "Real Estate & Infrastructure", keywords: ["real estate", "realty", "infrastructure", "construction", "builders", "properties", "housing", "developers"] },
  { segment: "Energy & Utilities", keywords: ["energy", "power", "solar", "petroleum", "oil", "gas", "utilities", "electric", "renewable"] },
  { segment: "Logistics & Transport", keywords: ["logistics", "supply chain", "shipping", "freight", "transport", "courier", "warehous", "airlines", "aviation"] },
  { segment: "Hospitality & Travel", keywords: ["hotel", "palace", "resort", "hospitality", "travel", "tourism"] },
  { segment: "FMCG & Retail", keywords: ["fmcg", "retail", "consumer goods", "foods", "beverage", "apparel", "supermarket", "e-commerce", "ecommerce", "hypermarket", "tesco", "specsmakers", "aromatic"] },
  { segment: "Manufacturing & Industrial", keywords: ["manufactur", "industries", "industrial", "engineering", "steel", "cement", "automotive", "auto ", "motors", "chemicals", "textile", "machinery", "factory", "bosch", "freudenberg", "engines", "reliance"] },
];

export const ROLE_SEGMENTS = [
  "Founder / Owner",
  "C-Suite",
  "VP / Director",
  "Head / Lead",
  "Manager",
  "Consultant / Specialist",
  "Analyst / Associate",
  "Academic / Researcher",
  "Other / Unclassified",
] as const;

export type RoleSegment = (typeof ROLE_SEGMENTS)[number];

const ROLE_RULES: Array<{ segment: RoleSegment; keywords: string[] }> = [
  { segment: "Founder / Owner", keywords: ["founder", "co-founder", "cofounder", "proprietor", "owner", "promoter", "partner", "entrepreneur"] },
  // VP outranks C-Suite here purely so "Vice President" isn't swallowed by
  // the C-Suite "president" keyword; a true president has no "vice" prefix.
  { segment: "VP / Director", keywords: [" vice president ", " vice president", " vp ", " avp ", " svp ", " evp ", " director ", " general manager ", " gm "] },
  { segment: "C-Suite", keywords: [" chief ", " ceo ", " cfo ", " coo ", " cto ", " cio ", " cmo ", " chro ", " ciso ", " cdo ", " managing director ", " md ", " president ", " chairman ", " chairperson "] },
  { segment: "Head / Lead", keywords: [" head ", " lead ", " principal ", " dean "] },
  { segment: "Academic / Researcher", keywords: ["professor", "faculty", "lecturer", "researcher", "scientist", "scholar", " phd "] },
  { segment: "Manager", keywords: ["manager", "supervisor", " mgr "] },
  { segment: "Consultant / Specialist", keywords: ["consultant", "specialist", "advisor", "adviser", "architect", "expert", "engineer", "developer", "designer"] },
  { segment: "Analyst / Associate", keywords: ["analyst", "associate", "executive", "officer", "coordinator", "assistant", "trainee", "intern"] },
];

function matchRules<T extends string>(
  rules: Array<{ segment: T; keywords: string[] }>,
  raw: string | null | undefined,
): T | null {
  if (!raw) return null;
  // Pad so keyword rules can safely use leading/trailing spaces to anchor
  // short abbreviations like " ca " or "gm " without matching inside words.
  const haystack = ` ${raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  if (haystack.trim().length === 0) return null;
  for (const rule of rules) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) return rule.segment;
  }
  return null;
}

/** Buckets a contact's organisation name into a broad industry segment. */
export function classifyIndustry(
  organization: string | null | undefined,
  tags: string[] = [],
): IndustrySegment {
  // An explicitly applied contact tag beats any guess from the org name —
  // staff tagging a contact "Banking" know better than our keyword list.
  const tagged = tags
    .map((tag) => INDUSTRY_SEGMENTS.find((segment) => segment.toLowerCase() === tag.trim().toLowerCase()))
    .find(Boolean);
  if (tagged) return tagged;
  return matchRules(INDUSTRY_RULES, organization) ?? "Other / Unclassified";
}

/** Buckets a contact's designation into a seniority/role segment. */
export function classifyRole(designation: string | null | undefined): RoleSegment {
  return matchRules(ROLE_RULES, designation) ?? "Other / Unclassified";
}

/** A normalised view of one answer, whatever its question type. */
export interface NormalizedAnswer {
  value: boolean | null;
  textValue: string | null;
  scaleValue: number | null;
  selectedOptions: string[] | null;
}

/**
 * Options that read as a positive/willing response. The questionnaire's
 * select options are phrased as degrees of willingness rather than yes/no,
 * so "engagement" has to be scored on that wording.
 */
const POSITIVE_PREFIXES = ["yes", "both ", "we currently offer"];
const EXPLORING_PREFIXES = ["interested in exploring", "we would like to explore", "maybe", "open to exploring", "subject to"];

export type Sentiment = "positive" | "exploring" | "negative" | "neutral";

/** Scores one select option's wording as willingness to collaborate. */
export function classifyOptionSentiment(option: string): Sentiment {
  const value = option.trim().toLowerCase();
  if (!value) return "neutral";
  if (POSITIVE_PREFIXES.some((p) => value.startsWith(p))) return "positive";
  if (EXPLORING_PREFIXES.some((p) => value.startsWith(p) || value.includes(p))) return "exploring";
  if (value.startsWith("not ") || value === "no" || value.startsWith("not interested")) return "negative";
  return "neutral";
}

/**
 * A 0–100 "collaboration readiness" score for one respondent, blending every
 * signal in their response: how they answered willingness questions, how many
 * collaboration areas they opted into, and their explicit 1–5 interest rating.
 * Purely derived — nothing is stored, so the weighting can change freely.
 */
export function readinessScore(
  questions: Array<{ id: string; type: string; options: unknown }>,
  answers: Map<string, NormalizedAnswer>,
): number {
  let earned = 0;
  let possible = 0;
  for (const question of questions) {
    const answer = answers.get(question.id);
    if (question.type === "SINGLE_SELECT" || question.type === "YES_NO") {
      possible += 1;
      if (!answer) continue;
      if (question.type === "YES_NO") { earned += answer.value === true ? 1 : 0; continue; }
      const picked = answer.selectedOptions?.[0];
      if (!picked) continue;
      const sentiment = classifyOptionSentiment(picked);
      earned += sentiment === "positive" ? 1 : sentiment === "exploring" ? 0.5 : 0;
    } else if (question.type === "MULTI_SELECT") {
      // Breadth of interest: opting into 3+ areas of a menu counts as full marks.
      possible += 1;
      const picked = answer?.selectedOptions?.length ?? 0;
      earned += Math.min(picked, 3) / 3;
    } else if (question.type === "SCALE_1_5") {
      // The explicit overall-interest rating is worth triple a single question.
      possible += 3;
      const scale = answer?.scaleValue;
      if (scale) earned += ((scale - 1) / 4) * 3;
    }
  }
  if (possible === 0) return 0;
  return Math.round((earned / possible) * 100);
}

/** Splits text into lowercase words, dropping stopwords and short tokens. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "our", "that", "this", "would", "have", "from", "are", "was", "were", "you", "your",
  "can", "will", "not", "but", "any", "all", "more", "than", "into", "them", "they", "their", "there", "which",
  "some", "such", "also", "been", "who", "what", "when", "how", "about", "very", "like", "just", "over", "only",
  "we", "us", "it", "is", "of", "to", "in", "on", "as", "at", "or", "be", "an", "a", "i",
]);

export function wordFrequencies(texts: string[], limit = 12): Array<{ word: string; count: number }> {
  const tally = new Map<string, number>();
  for (const text of texts) {
    for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
      const word = raw.replace(/^'+|'+$/g, "");
      if (word.length < 4 || STOPWORDS.has(word)) continue;
      tally.set(word, (tally.get(word) ?? 0) + 1);
    }
  }
  return Array.from(tally, ([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}
