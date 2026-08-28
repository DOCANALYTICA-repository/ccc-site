import { useState } from "react";
import { Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { activeFilterCount, EMPTY_FILTERS, type Filters } from "@/lib/surveyAnalytics";

/** Sticky filter bar shared by the analytics and individual-responses views.
 * Every chart on the page is recomputed from the filtered respondent set, so
 * one filter here answers "what does Banking think" across the whole form. */
export function FilterBar({
  filters,
  onChange,
  industries,
  roles,
  organisations,
  matched,
  total,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  industries: string[];
  roles: string[];
  organisations: string[];
  matched: number;
  total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = activeFilterCount(filters);

  function toggle(key: "industries" | "roles" | "organisations", value: string) {
    const current = filters[key];
    onChange({
      ...filters,
      [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    });
  }

  return (
    <Card className="sticky top-2 z-20 space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input
            className="pl-9"
            placeholder="Filter respondents by name, organisation, role…"
            value={filters.text}
            onChange={(e) => onChange({ ...filters, text: e.target.value })}
          />
        </div>
        <Button variant="secondary" onClick={() => setExpanded((v) => !v)}>
          <Filter className="h-4 w-4" aria-hidden />
          Filters{active ? ` (${active})` : ""}
        </Button>
        {active > 0 && (
          <Button variant="ghost" onClick={() => onChange({ ...EMPTY_FILTERS })}>
            <X className="h-4 w-4" aria-hidden />Clear
          </Button>
        )}
        <span className="ml-auto shrink-0 text-xs text-ink-muted">
          Showing <span className="font-semibold text-ink">{matched}</span> of {total} respondents
        </span>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-hairline pt-3">
          <ChipRow label="Industry" values={industries} selected={filters.industries} onToggle={(v) => toggle("industries", v)} />
          <ChipRow label="Role" values={roles} selected={filters.roles} onToggle={(v) => toggle("roles", v)} />
          <ChipRow label="Organisation" values={organisations} selected={filters.organisations} onToggle={(v) => toggle("organisations", v)} />
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Min interest</span>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <Chip key={n} active={filters.minInterest === n} onClick={() => onChange({ ...filters, minInterest: n })}>
                  {n === 0 ? "Any" : `${n}+`}
                </Chip>
              ))}
            </div>
            <Chip
              active={filters.wantsContactOnly}
              onClick={() => onChange({ ...filters, wantsContactOnly: !filters.wantsContactOnly })}
            >
              Wants follow-up only
            </Chip>
          </div>
        </div>
      )}

      {active > 0 && !expanded && (
        <div className="flex flex-wrap gap-1.5">
          {[...filters.industries, ...filters.roles, ...filters.organisations].map((value) => (
            <span key={value} className="rounded-full bg-page px-2.5 py-1 text-xs text-ink">{value}</span>
          ))}
          {filters.minInterest > 0 && <span className="rounded-full bg-page px-2.5 py-1 text-xs text-ink">Interest {filters.minInterest}+</span>}
          {filters.wantsContactOnly && <span className="rounded-full bg-page px-2.5 py-1 text-xs text-ink">Wants follow-up</span>}
        </div>
      )}
    </Card>
  );
}

function ChipRow({
  label, values, selected, onToggle,
}: { label: string; values: string[]; selected: string[]; onToggle: (value: string) => void }) {
  if (!values.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <Chip key={value} active={selected.includes(value)} onClick={() => onToggle(value)}>{value}</Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "border-ink bg-ink text-page" : "border-hairline bg-surface text-ink hover:bg-page"
      }`}
    >
      {children}
    </button>
  );
}
