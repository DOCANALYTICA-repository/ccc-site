import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Download, Search, Users } from "lucide-react";
import { api, downloadFile } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { BarChart, ColumnChart, Donut, StackedBar, StatTile } from "@/components/ui/BarChart";
import { AnalyticsBlock, InlineSelect } from "@/components/surveys/AnalyticsBlock";
import { FilterBar } from "@/components/surveys/FilterBar";
import { RespondentDetail } from "@/components/surveys/RespondentDetail";
import { RespondentTable } from "@/components/surveys/RespondentTable";
import {
  aggregateQuestion,
  applyFilters,
  COUNT_SORTS,
  EMPTY_FILTERS,
  groupBySection,
  matchesSearch,
  RESPONDENT_SORTS,
  sortCounts,
  sortRespondents,
  type Analytics,
  type CountSort,
  type Filters,
  type QuestionAggregate,
  type QuestionReport,
  type Respondent,
  type RespondentSort,
} from "@/lib/surveyAnalytics";

type Tab = "analytics" | "responses";
type Breakdown = "none" | "industry" | "role";

interface EventOption { id: string; name: string }

export function SurveyAnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const [eventId, setEventId] = useState(params.get("event") ?? "");
  const tab: Tab = params.get("tab") === "responses" ? "responses" : "analytics";

  const eventsQuery = useQuery("/events", () => api.get<{ events: EventOption[] }>("/events"));
  const events = useMemo(() => eventsQuery.data?.events ?? [], [eventsQuery.data]);
  // Analytics is a heavy aggregate — cache it so flipping between the two tabs
  // (and back from a respondent) repaints instantly instead of refetching.
  const analyticsQuery = useQuery(
    eventId ? `/surveys/events/${eventId}/analytics` : null,
    () => api.get<Analytics>(`/surveys/events/${eventId}/analytics`),
  );
  const data = analyticsQuery.data ?? null;
  const loading = analyticsQuery.loading || (eventsQuery.loading && !eventId);
  const loadError = analyticsQuery.error ? "No questionnaire is attached to this event yet." : null;

  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [search, setSearch] = useState("");
  const [respondentSort, setRespondentSort] = useState<RespondentSort>("readiness-desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setEventId((current) => current || events[0]?.id || "");
  }, [events]);

  function setTab(next: Tab) {
    const updated = new URLSearchParams(params);
    updated.set("tab", next);
    setParams(updated, { replace: true });
  }
  function chooseEvent(next: string) {
    setEventId(next);
    setSelectedId(null);
    const updated = new URLSearchParams(params);
    updated.set("event", next);
    setParams(updated, { replace: true });
  }

  const filtered = useMemo(
    () => (data ? applyFilters(data.respondents, filters) : []),
    [data, filters],
  );
  const sorted = useMemo(() => sortRespondents(filtered, respondentSort), [filtered, respondentSort]);
  const selectedIndex = sorted.findIndex((r) => r.responseId === selectedId);
  const selected = selectedIndex >= 0 ? sorted[selectedIndex] : null;

  const options = useMemo(() => {
    const unique = (values: string[]) => Array.from(new Set(values)).sort();
    return {
      industries: unique(data?.respondents.map((r) => r.industry) ?? []),
      roles: unique(data?.respondents.map((r) => r.role) ?? []),
      organisations: unique(data?.respondents.map((r) => r.organization?.trim() || "Not recorded") ?? []),
    };
  }, [data]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Questionnaire</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Analytics</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-11 rounded-control border border-hairline bg-surface px-3 text-sm text-ink"
            value={eventId}
            onChange={(e) => chooseEvent(e.target.value)}
          >
            <option value="">Select event</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
          <Button
            variant="secondary"
            disabled={!data}
            onClick={() => downloadFile(`/surveys/events/${eventId}/export.csv`, "survey-responses.csv")}
          >
            <Download className="h-4 w-4" aria-hidden />Export CSV
          </Button>
        </div>
      </header>

      <div className="flex gap-1 rounded-control bg-surface p-1">
        <TabButton active={tab === "analytics"} onClick={() => setTab("analytics")}>
          <BarChart3 className="h-4 w-4" aria-hidden />Analytics
        </TabButton>
        <TabButton active={tab === "responses"} onClick={() => setTab("responses")}>
          <Users className="h-4 w-4" aria-hidden />Individual responses
        </TabButton>
      </div>

      {loading && <p className="py-10 text-center text-sm text-ink-muted">Loading analytics…</p>}
      {!loading && loadError && (
        <Card className="py-12 text-center">
          <p className="text-sm text-ink-muted">{loadError}</p>
        </Card>
      )}

      {!loading && data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
            <span>
              <span className="font-semibold text-ink">{data.survey.title}</span> · status{" "}
              <span className="font-semibold text-ink">{data.survey.status}</span>
            </span>
            <span>{data.completion.submitted} of {data.completion.arrived} checked-in guests responded</span>
          </div>

          <FilterBar
            filters={filters}
            onChange={setFilters}
            industries={options.industries}
            roles={options.roles}
            organisations={options.organisations}
            matched={filtered.length}
            total={data.respondents.length}
          />

          {tab === "analytics" ? (
            <AnalyticsTab data={data} subset={filtered} search={search} onSearch={setSearch} />
          ) : (
            <ResponsesTab
              data={data}
              respondents={sorted}
              sort={respondentSort}
              onSort={setRespondentSort}
              selected={selected}
              selectedIndex={selectedIndex}
              onSelect={(r) => setSelectedId(r.responseId)}
              onClose={() => setSelectedId(null)}
              onStep={(delta) => {
                const next = sorted[selectedIndex + delta];
                if (next) setSelectedId(next.responseId);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-control px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-ink text-page" : "text-ink hover:bg-page"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Analytics tab                                                       */
/* ------------------------------------------------------------------ */

function AnalyticsTab({
  data, subset, search, onSearch,
}: { data: Analytics; subset: Respondent[]; search: string; onSearch: (value: string) => void }) {
  const [demandSort, setDemandSort] = useState<CountSort>("count-desc");
  const [segmentSort, setSegmentSort] = useState<CountSort>("count-desc");
  const [breakdown, setBreakdown] = useState<Breakdown>("none");

  // Every aggregate is recomputed from the filtered subset so the charts
  // always describe exactly the respondents the filter bar says are showing.
  const questions = useMemo(
    () => data.questions.map((q) => ({ question: q, aggregate: aggregateQuestion(q, subset) })),
    [data.questions, subset],
  );

  const segments = useMemo(() => {
    const build = (getKey: (r: Respondent) => string) => {
      const map = new Map<string, Respondent[]>();
      for (const r of subset) {
        if (!map.has(getKey(r))) map.set(getKey(r), []);
        map.get(getKey(r))!.push(r);
      }
      return Array.from(map, ([segment, members]) => ({
        segment,
        count: members.length,
        members,
        avgInterest: avg(members.map((m) => m.interest).filter((v): v is number => v != null)),
        avgReadiness: Math.round(avg(members.map((m) => m.readiness))),
        wantsContact: members.filter((m) => m.wantsContact).length,
      }));
    };
    return {
      industries: build((r) => r.industry),
      roles: build((r) => r.role),
      organisations: build((r) => r.organization?.trim() || "Not recorded"),
    };
  }, [subset]);

  const demand = useMemo(() => {
    const tally = new Map<string, number>();
    for (const { question } of questions) {
      if (question.type !== "MULTI_SELECT") continue;
      for (const r of subset) {
        for (const picked of (r.answers[question.id] as string[] | null) ?? []) {
          if (picked === "Other") continue;
          tally.set(picked, (tally.get(picked) ?? 0) + 1);
        }
      }
    }
    return Array.from(tally, ([option, count]) => ({ option, count }));
  }, [questions, subset]);

  const readinessBands = useMemo(() => ([
    { label: "0–20", count: subset.filter((r) => r.readiness <= 20).length },
    { label: "21–40", count: subset.filter((r) => r.readiness > 20 && r.readiness <= 40).length },
    { label: "41–60", count: subset.filter((r) => r.readiness > 40 && r.readiness <= 60).length },
    { label: "61–80", count: subset.filter((r) => r.readiness > 60 && r.readiness <= 80).length },
    { label: "81–100", count: subset.filter((r) => r.readiness > 80).length },
  ]), [subset]);

  const timeline = useMemo(() => {
    const tally = new Map<string, number>();
    for (const r of subset) {
      const day = r.submittedAt.slice(0, 10);
      tally.set(day, (tally.get(day) ?? 0) + 1);
    }
    return Array.from(tally, ([day, count]) => ({ label: day, count })).sort((a, b) => a.label.localeCompare(b.label));
  }, [subset]);

  const hotLeads = useMemo(
    () => subset.filter((r) => r.wantsContact || (r.interest ?? 0) >= 4 || r.readiness >= 70)
      .sort((a, b) => b.readiness - a.readiness),
    [subset],
  );

  const contactModes = useMemo(() => tallyBy(subset, (r) => r.preferredContactMode), [subset]);

  const textQuestions = questions.filter(({ question }) => question.type === "TEXT");

  // Each block declares the words it should be findable by; the search box
  // hides whole blocks rather than filtering inside them, so "industry"
  // narrows the page down to the industry views.
  const blocks: Array<{ id: string; keywords: string[]; node: React.ReactNode }> = [
    {
      id: "overview",
      keywords: ["overview", "summary", "completion", "response rate", "headline", "totals"],
      node: (
        <AnalyticsBlock id="overview" title="Overview" subtitle="Headline numbers for the current filter.">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="grid flex-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile value={subset.length} label="Respondents" hint={`of ${data.completion.arrived} checked in`} />
              <StatTile value={`${data.completion.rate}%`} label="Response rate" />
              <StatTile value={fixed(avg(subset.map((r) => r.interest).filter((v): v is number => v != null)))} label="Avg interest" hint="out of 5" />
              <StatTile value={`${Math.round(avg(subset.map((r) => r.readiness)))}%`} label="Avg readiness" />
              <StatTile value={subset.filter((r) => r.wantsContact).length} label="Want follow-up" />
              <StatTile value={segments.organisations.length} label="Organisations" hint={`${segments.industries.length} industries`} />
            </div>
            <Donut
              value={data.completion.submitted}
              total={data.completion.arrived}
              label={`${data.completion.submitted} of ${data.completion.arrived} checked-in guests submitted`}
            />
          </div>
        </AnalyticsBlock>
      ),
    },
    {
      id: "readiness",
      keywords: ["readiness", "collaboration readiness", "score", "interest", "distribution", "histogram", "overall interest"],
      node: (
        <AnalyticsBlock
          id="readiness"
          title="Collaboration readiness"
          subtitle="A 0–100 score per respondent, blending every willingness answer, breadth of interest, and their 1–5 rating."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink">Readiness distribution</h3>
              <BarChart total={subset.length} items={readinessBands.map((b) => ({ label: b.label, count: b.count }))} accent />
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink">Overall interest rating (1–5)</h3>
              {(() => {
                const scale = questions.find(({ question }) => question.type === "SCALE_1_5");
                if (!scale) return <p className="text-sm text-ink-muted">This questionnaire has no 1–5 rating question.</p>;
                return (
                  <>
                    <p className="mb-2 text-sm text-ink-muted">
                      Average <span className="font-semibold text-ink">{(scale.aggregate.average ?? 0).toFixed(1)} / 5</span>
                    </p>
                    <BarChart
                      total={scale.aggregate.responded ?? 0}
                      items={(scale.aggregate.distribution ?? []).map((d) => ({ label: String(d.value), count: d.count }))}
                    />
                  </>
                );
              })()}
            </div>
          </div>
        </AnalyticsBlock>
      ),
    },
    {
      id: "demand",
      keywords: ["demand", "partnership", "what they want", "collaboration areas", "ranking", "popular", "top areas"],
      node: (
        <AnalyticsBlock
          id="demand"
          title="Partnership demand"
          subtitle="Every collaboration area opted into anywhere in the questionnaire, ranked."
          action={<InlineSelect label="Sort" value={demandSort} options={COUNT_SORTS} onChange={setDemandSort} />}
        >
          {demand.length ? (
            <>
              {/* One area can appear in several questions (e.g. "Finance" is an
                  internship area and a training area), so a single respondent
                  can contribute more than one pick — percentages are of the
                  most-wanted area, not of the respondent count. */}
              <BarChart
                total={Math.max(...demand.map((d) => d.count))}
                items={sortCounts(demand, demandSort, (d) => d.option).slice(0, 25).map((d) => ({ label: d.option, count: d.count }))}
              />
              <p className="mt-2 text-xs text-ink-muted">Percentages are relative to the most-requested area.</p>
            </>
          ) : <p className="text-sm text-ink-muted">No collaboration areas selected yet.</p>}
        </AnalyticsBlock>
      ),
    },
    {
      id: "sections",
      keywords: ["section", "engagement", "which offers landed", "topic", "theme", "area performance"],
      node: (
        <AnalyticsBlock
          id="sections"
          title="Section engagement"
          subtitle="How positively each part of the questionnaire was answered — which offers actually landed."
        >
          <BarChart
            total={100}
            items={data.derived.sectionEngagement.map((s) => ({ label: `${s.section} (${s.questions}q)`, count: s.score }))}
            accent
          />
          <p className="mt-2 text-xs text-ink-muted">Scores are 0–100 across all respondents, not the current filter.</p>
        </AnalyticsBlock>
      ),
    },
    {
      id: "industry",
      keywords: ["industry", "sector", "banking", "consulting", "how different industries view us", "vertical", "segment"],
      node: (
        <AnalyticsBlock
          id="industry"
          title="By industry"
          subtitle="How organisations in each sector view a partnership with us."
          action={<InlineSelect label="Sort" value={segmentSort} options={COUNT_SORTS} onChange={setSegmentSort} />}
        >
          <SegmentGrid segments={sortCounts(segments.industries, segmentSort, (s) => s.segment)} />
        </AnalyticsBlock>
      ),
    },
    {
      id: "role",
      keywords: ["role", "seniority", "designation", "how roles view us", "c-suite", "manager", "director", "job title"],
      node: (
        <AnalyticsBlock
          id="role"
          title="By role and seniority"
          subtitle="Whether decision-makers and practitioners see the collaboration differently."
          action={<InlineSelect label="Sort" value={segmentSort} options={COUNT_SORTS} onChange={setSegmentSort} />}
        >
          <SegmentGrid segments={sortCounts(segments.roles, segmentSort, (s) => s.segment)} />
        </AnalyticsBlock>
      ),
    },
    {
      id: "organisation",
      keywords: ["organisation", "organization", "company", "firm", "employer", "account"],
      node: (
        <AnalyticsBlock
          id="organisation"
          title="By organisation"
          subtitle="Every organisation that responded, with its aggregate appetite."
          action={<InlineSelect label="Sort" value={segmentSort} options={COUNT_SORTS} onChange={setSegmentSort} />}
        >
          <SegmentTable segments={sortCounts(segments.organisations, segmentSort, (s) => s.segment)} />
        </AnalyticsBlock>
      ),
    },
    {
      id: "leads",
      keywords: ["leads", "hot leads", "follow up", "contact", "next steps", "outreach", "priority", "who to call"],
      node: (
        <AnalyticsBlock
          id="leads"
          title="Priority follow-ups"
          subtitle="Respondents who asked to be contacted, rated us 4+, or scored 70%+ readiness."
        >
          {hotLeads.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-hairline text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Respondent</th>
                    <th className="py-2 pr-3 font-semibold">Industry</th>
                    <th className="py-2 pr-3 text-right font-semibold">Interest</th>
                    <th className="py-2 pr-3 text-right font-semibold">Readiness</th>
                    <th className="py-2 pr-3 font-semibold">Preferred contact</th>
                    <th className="py-2 font-semibold">Reach them</th>
                  </tr>
                </thead>
                <tbody>
                  {hotLeads.map((lead) => (
                    <tr key={lead.responseId} className="border-b border-hairline/60">
                      <td className="py-2.5 pr-3">
                        <span className="block font-medium text-ink">{lead.name}</span>
                        <span className="block text-xs text-ink-muted">{[lead.designation, lead.organization].filter(Boolean).join(" · ") || "—"}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted">{lead.industry}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{lead.interest ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{lead.readiness}%</td>
                      <td className="py-2.5 pr-3 text-ink-muted">{lead.preferredContactMode ?? "—"}</td>
                      <td className="py-2.5 text-xs">
                        {lead.email
                          ? <a className="text-accent-ink hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a>
                          : lead.phone
                            ? <a className="text-accent-ink hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a>
                            : <span className="text-ink-muted">No contact on file</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-ink-muted">No respondents cross the follow-up threshold yet.</p>}
        </AnalyticsBlock>
      ),
    },
    {
      id: "contactability",
      keywords: ["contact", "mode", "email", "phone", "meeting", "engagement", "how to reach", "preference"],
      node: (
        <AnalyticsBlock id="contactability" title="Contact preferences" subtitle="How respondents want to be followed up with.">
          {contactModes.length
            ? <BarChart total={subset.length} items={contactModes.map((c) => ({ label: c.label, count: c.count }))} />
            : <p className="text-sm text-ink-muted">No contact preferences recorded yet.</p>}
        </AnalyticsBlock>
      ),
    },
    {
      id: "timeline",
      keywords: ["timeline", "over time", "when", "submissions", "uptake", "trend", "daily"],
      node: (
        <AnalyticsBlock id="timeline" title="Submissions over time" subtitle="Uptake by day since the form opened.">
          <ColumnChart items={timeline} />
        </AnalyticsBlock>
      ),
    },
    {
      id: "text",
      keywords: ["free text", "comments", "open ended", "verbatim", "suggestions", "quotes", "written answers", "words"],
      node: (
        <AnalyticsBlock
          id="text"
          title="Written answers"
          subtitle="Every free-text answer, attributed, with the words that come up most."
        >
          {textQuestions.length ? (
            <div className="space-y-6">
              {textQuestions.map(({ question, aggregate }) => {
                const responses = aggregate.responses ?? [];
                return (
                  <div key={question.id}>
                    <h3 className="text-sm font-semibold text-ink">{question.prompt}</h3>
                    {question.words?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {question.words.map((w) => (
                          <span key={w.word} className="rounded-full bg-page px-2.5 py-1 text-xs text-ink">
                            {w.word} <span className="text-ink-muted">×{w.count}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {responses.length ? (
                      <ul className="mt-3 space-y-2">
                        {responses.map((r) => (
                          <li key={r.respondentId} className="rounded-control bg-page p-3 text-sm">
                            <p className="text-ink">{r.text}</p>
                            <p className="mt-1.5 text-xs text-ink-muted">
                              — {r.name}{r.organization ? `, ${r.organization}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-sm text-ink-muted">No written answers match the current filters.</p>}
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-ink-muted">This questionnaire has no free-text questions.</p>}
        </AnalyticsBlock>
      ),
    },
  ];

  const visibleBlocks = blocks.filter((block) => matchesSearch(search, block.id, ...block.keywords));

  const questionSections = groupBySection(
    questions.map(({ question, aggregate }) => ({ ...question, aggregate })),
  ).map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      matchesSearch(search, item.prompt, item.section, group.section, ...(item.options ?? []))),
  })).filter((group) => group.items.length > 0);

  const totalQuestions = questions.length;
  const shownQuestions = questionSections.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <Input
          className="pl-9"
          placeholder="Search analytics — try “industry”, “leads”, “capstone”, “timeline”…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      {search.trim() && (
        <p className="text-xs text-ink-muted">
          Showing {visibleBlocks.length} of {blocks.length} analytics sections and {shownQuestions} of {totalQuestions} questions.
          {visibleBlocks.length === 0 && shownQuestions === 0 && " Nothing matches — try a different term."}
        </p>
      )}

      {visibleBlocks.map((block) => <div key={block.id}>{block.node}</div>)}

      {questionSections.length > 0 && (
        <AnalyticsBlock
          id="questions"
          title="Question by question"
          subtitle="Every question's results, optionally split by who answered it."
          action={
            <InlineSelect
              label="Break down by"
              value={breakdown}
              options={[
                { value: "none" as Breakdown, label: "Nothing" },
                { value: "industry" as Breakdown, label: "Industry" },
                { value: "role" as Breakdown, label: "Role" },
              ]}
              onChange={setBreakdown}
            />
          }
        >
          <div className="space-y-7">
            {questionSections.map((group) => (
              <section key={group.section}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink">{group.section}</h3>
                <div className="mt-3 space-y-4">
                  {group.items.map((item) => (
                    <div key={item.id} className="rounded-control bg-page p-4">
                      <p className="font-medium text-ink">{item.prompt}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">{item.aggregate.responded ?? 0} answered</p>
                      <div className="mt-3">
                        <QuestionChart aggregate={item.aggregate} />
                      </div>
                      {breakdown !== "none" && (
                        <QuestionBreakdown
                          question={item}
                          subset={subset}
                          by={breakdown}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </AnalyticsBlock>
      )}
    </div>
  );
}

/** Renders whichever chart shape fits this question's type. */
function QuestionChart({ aggregate }: { aggregate: QuestionAggregate }) {
  if (aggregate.type === "YES_NO") {
    const total = (aggregate.yes ?? 0) + (aggregate.no ?? 0);
    return <BarChart total={total} accent items={[{ label: "Yes", count: aggregate.yes ?? 0 }, { label: "No", count: aggregate.no ?? 0 }]} />;
  }
  if (aggregate.type === "SINGLE_SELECT" || aggregate.type === "MULTI_SELECT") {
    return <BarChart total={aggregate.responded ?? 0} items={(aggregate.counts ?? []).map((c) => ({ label: c.option, count: c.count }))} />;
  }
  if (aggregate.type === "SCALE_1_5") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ink-muted">Average <span className="font-semibold text-ink">{(aggregate.average ?? 0).toFixed(1)} / 5</span></p>
        <BarChart total={aggregate.responded ?? 0} accent items={(aggregate.distribution ?? []).map((d) => ({ label: String(d.value), count: d.count }))} />
      </div>
    );
  }
  const responses = aggregate.responses ?? [];
  if (!responses.length) return <p className="text-sm text-ink-muted">No written answers yet.</p>;
  return (
    <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
      {responses.map((r) => (
        <li key={r.respondentId} className="rounded-control border border-hairline bg-surface p-2">
          <p className="text-ink">{r.text}</p>
          <p className="mt-1 text-xs text-ink-muted">— {r.name}{r.organization ? `, ${r.organization}` : ""}</p>
        </li>
      ))}
    </ul>
  );
}

/** Cross-tab: one stacked row per segment showing how that segment answered. */
function QuestionBreakdown({
  question, subset, by,
}: { question: QuestionReport; subset: Respondent[]; by: Exclude<Breakdown, "none"> }) {
  const groups = new Map<string, Respondent[]>();
  for (const respondent of subset) {
    const key = by === "industry" ? respondent.industry : respondent.role;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(respondent);
  }
  if (question.type === "TEXT") {
    return <p className="mt-4 text-xs text-ink-muted">Free-text answers can't be cross-tabbed — see “Written answers” above.</p>;
  }
  const keys = question.type === "YES_NO"
    ? ["Yes", "No"]
    : question.type === "SCALE_1_5"
      ? ["1", "2", "3", "4", "5"]
      : question.options ?? [];
  if (!keys.length) return null;

  const rows = Array.from(groups, ([segment, members]) => {
    const aggregate = aggregateQuestion(question, members);
    const values: Record<string, number> = {};
    if (question.type === "YES_NO") {
      values.Yes = aggregate.yes ?? 0;
      values.No = aggregate.no ?? 0;
    } else if (question.type === "SCALE_1_5") {
      for (const d of aggregate.distribution ?? []) values[String(d.value)] = d.count;
    } else {
      for (const c of aggregate.counts ?? []) values[c.option] = c.count;
    }
    return { label: segment, total: members.length, values };
  }).sort((a, b) => b.total - a.total);

  return (
    <div className="mt-4 border-t border-hairline pt-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Split by {by === "industry" ? "industry" : "role"}
      </p>
      <StackedBar rows={rows} keys={keys} />
    </div>
  );
}

function SegmentGrid({
  segments,
}: {
  segments: Array<{ segment: string; count: number; avgInterest: number; avgReadiness: number; wantsContact: number; topInterests?: never }>;
}) {
  if (!segments.length) return <p className="text-sm text-ink-muted">No respondents in this view.</p>;
  const max = Math.max(1, ...segments.map((s) => s.count));
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {segments.map((s) => (
        <div key={s.segment} className="rounded-control bg-page p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate font-medium text-ink">{s.segment}</h3>
            <span className="shrink-0 text-xs text-ink-muted">{s.count} {s.count === 1 ? "respondent" : "respondents"}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-ink" style={{ width: `${(s.count / max) * 100}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-sm font-semibold tabular-nums text-ink">{fixed(s.avgInterest)}</p>
              <p className="text-[11px] text-ink-muted">Avg interest</p>
            </div>
            <div>
              <p className="text-sm font-semibold tabular-nums text-ink">{s.avgReadiness}%</p>
              <p className="text-[11px] text-ink-muted">Readiness</p>
            </div>
            <div>
              <p className="text-sm font-semibold tabular-nums text-ink">{s.wantsContact}</p>
              <p className="text-[11px] text-ink-muted">Want follow-up</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SegmentTable({
  segments,
}: {
  segments: Array<{ segment: string; count: number; avgInterest: number; avgReadiness: number; wantsContact: number }>;
}) {
  if (!segments.length) return <p className="text-sm text-ink-muted">No respondents in this view.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-hairline text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="py-2 pr-3 font-semibold">Organisation</th>
            <th className="py-2 pr-3 text-right font-semibold">Respondents</th>
            <th className="py-2 pr-3 text-right font-semibold">Avg interest</th>
            <th className="py-2 pr-3 text-right font-semibold">Readiness</th>
            <th className="py-2 text-right font-semibold">Want follow-up</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr key={s.segment} className="border-b border-hairline/60">
              <td className="py-2.5 pr-3 font-medium text-ink">{s.segment}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{s.count}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{fixed(s.avgInterest)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{s.avgReadiness}%</td>
              <td className="py-2.5 text-right tabular-nums text-ink">{s.wantsContact}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Individual responses tab                                            */
/* ------------------------------------------------------------------ */

function ResponsesTab({
  data, respondents, sort, onSort, selected, selectedIndex, onSelect, onClose, onStep,
}: {
  data: Analytics;
  respondents: Respondent[];
  sort: RespondentSort;
  onSort: (sort: RespondentSort) => void;
  selected: Respondent | null;
  selectedIndex: number;
  onSelect: (respondent: Respondent) => void;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="space-y-4">
      {selected && (
        <RespondentDetail
          respondent={selected}
          questions={data.questions}
          onClose={onClose}
          onPrev={selectedIndex > 0 ? () => onStep(-1) : undefined}
          onNext={selectedIndex < respondents.length - 1 ? () => onStep(1) : undefined}
          position={`${selectedIndex + 1} of ${respondents.length}`}
        />
      )}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">
            {respondents.length} {respondents.length === 1 ? "response" : "responses"}
          </h2>
          <InlineSelect label="Sort" value={sort} options={RESPONDENT_SORTS} onChange={onSort} />
        </div>
        <RespondentTable
          respondents={respondents}
          selectedId={selected?.responseId ?? null}
          onSelect={onSelect}
        />
      </Card>
    </div>
  );
}

/* helpers */
function avg(nums: number[]): number {
  return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;
}
function fixed(value: number): string {
  return value ? value.toFixed(1) : "—";
}
function tallyBy(respondents: Respondent[], getKey: (r: Respondent) => string | null): Array<{ label: string; count: number }> {
  const tally = new Map<string, number>();
  for (const respondent of respondents) {
    const key = getKey(respondent);
    if (!key) continue;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return Array.from(tally, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
