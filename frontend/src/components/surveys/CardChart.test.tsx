import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardChart } from "./CardChart";
import { BLOCK_CARDS, questionCardKey } from "@/lib/analyticsCards";
import type { Analytics, QuestionReport, Respondent } from "@/lib/surveyAnalytics";

/* These tests stand in for a live run-through with guest accounts: the real
 * event has no submitted responses, so the only way to prove every dashboard
 * chart actually draws is to feed the components a realistic payload here. */

function question(partial: Partial<QuestionReport>): QuestionReport {
  return {
    id: "q1", prompt: "Prompt", type: "SINGLE_SELECT", section: "Section",
    options: ["Yes", "No"],
    breakdowns: { byIndustry: [], byRole: [], byTable: [], byProgramme: [] },
    ...partial,
  };
}

function respondent(partial: Partial<Respondent>): Respondent {
  return {
    responseId: "r1", invitationId: "i1", contactId: "c1",
    name: "Asha Rao", organization: "HDFC Bank", designation: "Head of Retail",
    email: "asha@example.com", phone: null, profileUrl: null, tags: [],
    submittedAt: "2026-08-01T10:00:00.000Z",
    industry: "Banking", role: "Head / Lead",
    interest: 4, readiness: 70, wantsContact: true, preferredContactMode: "Email",
    tableNumber: 1, tableLabel: "Table 1", programmeFocus: "BCOM (AFA)", seniorityBand: "VP / Senior Director",
    answers: {},
    ...partial,
  };
}

const QUESTIONS: QuestionReport[] = [
  question({ id: "qSingle", prompt: "Capstone projects?", type: "SINGLE_SELECT", options: ["Yes, definitely", "Not at present"] }),
  question({ id: "qMulti", prompt: "Preferred areas", type: "MULTI_SELECT", options: ["Finance", "Marketing", "Other"] }),
  question({ id: "qScale", prompt: "Overall interest", type: "SCALE_1_5", options: null }),
  question({ id: "qYesNo", prompt: "Co-design?", type: "YES_NO", options: null }),
  question({ id: "qText", prompt: "Anything else?", type: "TEXT", options: null }),
];

const RESPONDENTS: Respondent[] = [
  respondent({
    responseId: "a", name: "Asha Rao", industry: "Banking", role: "C-Suite",
    organization: "HDFC Bank", interest: 5, readiness: 90, wantsContact: true, preferredContactMode: "Email",
    submittedAt: "2026-08-01T10:00:00.000Z",
    answers: { qSingle: "Yes, definitely", qMulti: ["Finance", "Marketing"], qScale: 5, qYesNo: true, qText: "More analytics please" },
  }),
  respondent({
    responseId: "b", name: "Bala Iyer", industry: "Consulting", role: "Manager",
    organization: "Acme Advisory", interest: 2, readiness: 30, wantsContact: false, preferredContactMode: "Phone",
    tableNumber: 2, tableLabel: "Table 2", programmeFocus: "MCOM", seniorityBand: "Manager",
    submittedAt: "2026-08-02T10:00:00.000Z",
    answers: { qSingle: "Not at present", qMulti: ["Finance"], qScale: 2, qYesNo: false, qText: "" },
  }),
];

const DATA: Analytics = {
  survey: { id: "s1", title: "CCC relationship follow-up", status: "OPEN", openedAt: null, closedAt: null },
  completion: { arrived: 4, submitted: 2, outstanding: 2, rate: 50 },
  headline: { avgInterest: 3.5, avgReadiness: 60, wantsContact: 1, organisations: 2, industries: 2, roles: 2 },
  questions: QUESTIONS,
  segments: { industries: [], roles: [], organisations: [], tables: [], programmes: [] },
  derived: {
    sectionEngagement: [{ section: "Section", score: 75, questions: 5 }],
    partnershipDemand: [],
    hotLeads: [],
    timeline: [],
    tableParticipation: [
      { tableLabel: "Table 1", tableNumber: 1, programmeFocus: "BCOM (AFA)", seated: 5, responded: 2, rate: 40, avgInterest: 3.5, avgReadiness: 60, wantsContact: 1, topInterests: [] },
      { tableLabel: "Table 2", tableNumber: 2, programmeFocus: "MCOM", seated: 4, responded: 0, rate: 0, avgInterest: 0, avgReadiness: 0, wantsContact: 0, topInterests: [] },
    ],
  },
  respondents: RESPONDENTS,
  readinessDistribution: [],
};

describe("CardChart — every pinnable block renders", () => {
  // The dashboard offers exactly these keys, so each one must draw something
  // rather than falling through to the unknown-card placeholder.
  it.each(BLOCK_CARDS.map((c) => c.key))("renders the %s block", (key) => {
    const { container } = render(<CardChart cardKey={key} data={DATA} subset={RESPONDENTS} />);
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.queryByText("This chart is no longer available.")).toBeNull();
  });

  it("shows real numbers in the overview rather than an empty frame", () => {
    render(<CardChart cardKey="overview" data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("Respondents")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Response rate")).toBeInTheDocument();
    // "50%" shows twice — the response-rate tile and the donut both report it.
    expect(screen.getAllByText("50%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2 of 4 checked-in guests submitted")).toBeInTheDocument();
  });

  it("labels each industry in the industry block", () => {
    render(<CardChart cardKey="industry" data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("Banking")).toBeInTheDocument();
    expect(screen.getByText("Consulting")).toBeInTheDocument();
  });

  it("ranks collaboration areas and hides the Other bucket", () => {
    render(<CardChart cardKey="demand" data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
    expect(screen.queryByText("Other")).toBeNull();
  });

  it("lists priority follow-ups by name", () => {
    render(<CardChart cardKey="leads" data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
  });

  it("tallies contact preferences", () => {
    render(<CardChart cardKey="contactability" data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
  });
});

describe("CardChart — question charts", () => {
  it("renders a single-select question with its options", () => {
    render(<CardChart cardKey={questionCardKey("qSingle")} data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("Yes, definitely")).toBeInTheDocument();
    expect(screen.getByText("Not at present")).toBeInTheDocument();
  });

  it("renders a multi-select question", () => {
    render(<CardChart cardKey={questionCardKey("qMulti")} data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("renders a 1-5 scale with its average", () => {
    render(<CardChart cardKey={questionCardKey("qScale")} data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("3.5 / 5")).toBeInTheDocument();
  });

  it("renders a yes/no split", () => {
    render(<CardChart cardKey={questionCardKey("qYesNo")} data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });
});

describe("CardChart — degrades safely", () => {
  it("says so plainly when a pinned question no longer exists", () => {
    // A chart pinned, then its question deleted from the template. This must
    // not throw: one stale key would otherwise take the whole dashboard down.
    render(<CardChart cardKey={questionCardKey("deleted-question")} data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("This chart is no longer available.")).toBeInTheDocument();
  });

  it("handles an unknown block key without crashing", () => {
    render(<CardChart cardKey="not-a-real-block" data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("This chart is no longer available.")).toBeInTheDocument();
  });

  it("renders every block with no respondents at all", () => {
    // The live event is in exactly this state until guests submit, so an
    // empty subset must produce readable empty states, not blank frames.
    for (const card of BLOCK_CARDS) {
      const { container, unmount } = render(<CardChart cardKey={card.key} data={DATA} subset={[]} />);
      expect(container).not.toBeEmptyDOMElement();
      unmount();
    }
  });

  it("renders a question chart with no answers", () => {
    render(<CardChart cardKey={questionCardKey("qSingle")} data={DATA} subset={[]} />);
    expect(screen.getByText("Yes, definitely")).toBeInTheDocument();
  });
});


describe("CardChart — seating charts", () => {
  it("groups respondents by table", () => {
    render(<CardChart cardKey="table" data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("Table 1")).toBeInTheDocument();
    expect(screen.getByText("Table 2")).toBeInTheDocument();
  });

  it("shows participation against everyone seated, including a silent table", () => {
    render(<CardChart cardKey="tableParticipation" data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("2/5 · 40%")).toBeInTheDocument();
    // A table nobody has answered from is the most useful row on the board.
    expect(screen.getByText("0/4 · 0%")).toBeInTheDocument();
  });

  it("says so when no seating plan has been imported", () => {
    const noSeating = { ...DATA, derived: { ...DATA.derived, tableParticipation: [] } };
    render(<CardChart cardKey="tableParticipation" data={noSeating} subset={RESPONDENTS} />);
    expect(screen.getByText("No seating plan has been imported for this event.")).toBeInTheDocument();
  });

  it("charts readiness per table", () => {
    render(<CardChart cardKey="tableReadiness" data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("Table 1")).toBeInTheDocument();
  });

  it("groups by programme focus and seniority band", () => {
    const { unmount } = render(<CardChart cardKey="programme" data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("BCOM (AFA)")).toBeInTheDocument();
    unmount();
    render(<CardChart cardKey="seniority" data={DATA} subset={RESPONDENTS} />);
    expect(screen.getByText("VP / Senior Director")).toBeInTheDocument();
  });

  it("renders the seating charts with nobody seated", () => {
    for (const key of ["table", "programme", "seniority", "tableReadiness"]) {
      const { container, unmount } = render(<CardChart cardKey={key} data={DATA} subset={[]} />);
      expect(container).not.toBeEmptyDOMElement();
      unmount();
    }
  });
});
