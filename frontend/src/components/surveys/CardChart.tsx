import { BarChart, ColumnChart, Donut, StatTile } from "@/components/ui/BarChart";
import {
  contactModes,
  industryRows,
  organisationRows,
  partnershipDemand,
  priorityLeads,
  questionAggregateFor,
  readinessBands,
  roleRows,
  submissionTimeline,
  type SegmentRow,
} from "@/lib/analyticsCards";
import type { Analytics, QuestionAggregate, Respondent } from "@/lib/surveyAnalytics";

/** Renders one pinned analytics chart by key.
 *
 * The dashboard and the analytics tab both draw through this, so a chart looks
 * the same in either place and there is only one implementation to keep right.
 * An unknown key renders a placeholder rather than throwing — a pinned chart
 * whose question was later deleted must not take the dashboard down with it.
 */
export function CardChart({
  cardKey,
  data,
  subset,
}: {
  cardKey: string;
  data: Analytics;
  subset: Respondent[];
}) {
  switch (cardKey) {
    case "overview":
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile value={subset.length} label="Respondents" hint={`of ${data.completion.arrived} checked in`} />
            <StatTile value={`${data.completion.rate}%`} label="Response rate" />
            <StatTile value={`${Math.round(avg(subset.map((r) => r.readiness)))}%`} label="Avg readiness" />
          </div>
          <Donut
            value={data.completion.submitted}
            total={data.completion.arrived}
            label={`${data.completion.submitted} of ${data.completion.arrived} checked-in guests submitted`}
          />
        </div>
      );

    case "readiness": {
      const bands = readinessBands(subset);
      return <BarChart total={subset.length} items={bands} accent />;
    }

    case "demand": {
      const demand = partnershipDemand(data.questions, subset);
      if (!demand.length) return <Empty>No collaboration areas selected yet.</Empty>;
      const max = Math.max(...demand.map((d) => d.count));
      return (
        <BarChart
          total={max}
          items={[...demand].sort((a, b) => b.count - a.count).slice(0, 10).map((d) => ({ label: d.option, count: d.count }))}
        />
      );
    }

    case "sections":
      return (
        <BarChart
          total={100}
          accent
          items={data.derived.sectionEngagement.map((s) => ({ label: s.section, count: s.score }))}
        />
      );

    case "industry":
      return <SegmentBars rows={industryRows(subset)} />;

    case "role":
      return <SegmentBars rows={roleRows(subset)} />;

    case "organisation":
      return <SegmentBars rows={organisationRows(subset)} />;

    case "leads": {
      const leads = priorityLeads(subset);
      if (!leads.length) return <Empty>No respondents cross the follow-up threshold yet.</Empty>;
      return (
        <ul className="space-y-2">
          {leads.slice(0, 8).map((lead) => (
            <li key={lead.responseId} className="flex items-baseline justify-between gap-3 rounded-control bg-page p-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{lead.name}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {[lead.designation, lead.organization].filter(Boolean).join(" · ") || lead.industry}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">{lead.readiness}%</span>
            </li>
          ))}
        </ul>
      );
    }

    case "contactability": {
      const modes = contactModes(subset);
      if (!modes.length) return <Empty>No contact preferences recorded yet.</Empty>;
      return <BarChart total={subset.length} items={modes} />;
    }

    case "timeline":
      return <ColumnChart items={submissionTimeline(subset)} />;

    default: {
      const found = questionAggregateFor(cardKey, data, subset);
      if (!found) {
        // The pinned question is gone from the survey, or the key predates a
        // rename. Say so plainly instead of rendering an empty frame.
        return <Empty>This chart is no longer available.</Empty>;
      }
      return <QuestionChart aggregate={found.aggregate} />;
    }
  }
}

/** One question's results, in whichever shape its type calls for. */
export function QuestionChart({ aggregate }: { aggregate: QuestionAggregate }) {
  if (aggregate.type === "YES_NO") {
    const total = (aggregate.yes ?? 0) + (aggregate.no ?? 0);
    return (
      <BarChart
        total={total}
        accent
        items={[{ label: "Yes", count: aggregate.yes ?? 0 }, { label: "No", count: aggregate.no ?? 0 }]}
      />
    );
  }
  if (aggregate.type === "SINGLE_SELECT" || aggregate.type === "MULTI_SELECT") {
    return (
      <BarChart
        total={aggregate.responded ?? 0}
        items={(aggregate.counts ?? []).map((c) => ({ label: c.option, count: c.count }))}
      />
    );
  }
  if (aggregate.type === "SCALE_1_5") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ink-muted">
          Average <span className="font-semibold text-ink">{(aggregate.average ?? 0).toFixed(1)} / 5</span>
        </p>
        <BarChart
          total={aggregate.responded ?? 0}
          accent
          items={(aggregate.distribution ?? []).map((d) => ({ label: String(d.value), count: d.count }))}
        />
      </div>
    );
  }
  // TEXT questions are never pinnable, but the analytics tab still draws them
  // through here, so keep the branch rather than assuming it cannot happen.
  const responses = aggregate.responses ?? [];
  if (!responses.length) return <Empty>No written answers yet.</Empty>;
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

function SegmentBars({ rows }: { rows: SegmentRow[] }) {
  if (!rows.length) return <Empty>No respondents in this view.</Empty>;
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  return <BarChart total={sorted.reduce((sum, r) => sum + r.count, 0)} items={sorted.map((r) => ({ label: r.segment, count: r.count }))} />;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-muted">{children}</p>;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;
}
