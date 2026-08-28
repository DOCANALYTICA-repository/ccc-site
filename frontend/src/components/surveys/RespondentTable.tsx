import { Check } from "lucide-react";
import type { Respondent } from "@/lib/surveyAnalytics";

/** Sortable, clickable list of everyone who submitted.
 * Renders as a table on wide screens and stacked cards on phones, since the
 * admin tools are used on the floor at events as often as at a desk. */
export function RespondentTable({
  respondents,
  selectedId,
  onSelect,
}: {
  respondents: Respondent[];
  selectedId: string | null;
  onSelect: (respondent: Respondent) => void;
}) {
  if (!respondents.length) {
    return <p className="py-10 text-center text-sm text-ink-muted">No respondents match the current filters.</p>;
  }
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-hairline text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-2 pr-3 font-semibold">Respondent</th>
              <th className="py-2 pr-3 font-semibold">Industry</th>
              <th className="py-2 pr-3 font-semibold">Role</th>
              <th className="py-2 pr-3 text-right font-semibold">Interest</th>
              <th className="py-2 pr-3 text-right font-semibold">Readiness</th>
              <th className="py-2 pr-3 font-semibold">Follow-up</th>
              <th className="py-2 font-semibold">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {respondents.map((r) => (
              <tr
                key={r.responseId}
                onClick={() => onSelect(r)}
                className={`cursor-pointer border-b border-hairline/60 transition-colors hover:bg-page ${
                  selectedId === r.responseId ? "bg-page" : ""
                }`}
              >
                <td className="py-2.5 pr-3">
                  <span className="block font-medium text-ink">{r.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {[r.designation, r.organization].filter(Boolean).join(" · ") || "—"}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-ink-muted">{r.industry}</td>
                <td className="py-2.5 pr-3 text-ink-muted">{r.role}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{r.interest ?? "—"}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{r.readiness}%</td>
                <td className="py-2.5 pr-3">
                  {r.wantsContact ? <Check className="h-4 w-4 text-ink" aria-label="Wants follow-up" /> : <span className="text-ink-muted">—</span>}
                </td>
                <td className="py-2.5 text-xs text-ink-muted">{new Date(r.submittedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {respondents.map((r) => (
          <button
            key={r.responseId}
            type="button"
            onClick={() => onSelect(r)}
            className={`w-full cursor-pointer rounded-control border border-hairline p-3 text-left transition-colors ${
              selectedId === r.responseId ? "bg-page" : "bg-surface hover:bg-page"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium text-ink">{r.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">{r.readiness}%</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-muted">
              {[r.designation, r.organization].filter(Boolean).join(" · ") || "—"}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {r.industry} · {r.role} · interest {r.interest ?? "—"}
              {r.wantsContact ? " · wants follow-up" : ""}
            </p>
          </button>
        ))}
      </div>
    </>
  );
}
