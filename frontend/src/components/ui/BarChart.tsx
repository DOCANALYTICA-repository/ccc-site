/** Lightweight horizontal bar chart, no external charting library.
 * Renders a labeled row per item with a proportional bar and count/%. */
interface BarItem {
  label: string;
  count: number;
}

export function BarChart({ items, total, accent = false }: { items: BarItem[]; total: number; accent?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const pct = total ? Math.round((item.count / total) * 100) : 0;
        return (
          <div key={item.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-ink">{item.label}</span>
              <span className="shrink-0 text-xs text-ink-muted">{item.count} · {pct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-page">
              <div
                className={`h-full rounded-full transition-all ${accent ? "bg-accent" : "bg-ink"}`}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A single headline number with a caption, for overview strips. */
export function StatTile({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <div className="rounded-control bg-page p-4">
      <p className="text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-xs font-medium text-ink">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/** One row per segment, each split into proportional coloured spans.
 * Used for cross-tabs — e.g. how each industry answered one question. */
export function StackedBar({
  rows,
  keys,
}: {
  rows: Array<{ label: string; total: number; values: Record<string, number> }>;
  keys: string[];
}) {
  // A fixed spread of the accent hue keeps every stacked chart on the page
  // consistent without pulling in a palette library.
  const shade = (index: number) => `hsl(28 62% ${Math.max(24, 68 - index * 9)}%)`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {keys.map((key, i) => (
          <span key={key} className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: shade(i) }} />
            {key}
          </span>
        ))}
      </div>
      {rows.map((row) => {
        const sum = keys.reduce((total, key) => total + (row.values[key] ?? 0), 0);
        return (
          <div key={row.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-ink">{row.label}</span>
              <span className="shrink-0 text-xs text-ink-muted">{row.total} {row.total === 1 ? "respondent" : "respondents"}</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-page">
              {sum === 0
                ? null
                : keys.map((key, i) => {
                    const count = row.values[key] ?? 0;
                    if (!count) return null;
                    return (
                      <div
                        key={key}
                        title={`${key}: ${count}`}
                        style={{ width: `${(count / sum) * 100}%`, background: shade(i) }}
                      />
                    );
                  })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Vertical column chart, for ordered series like a submission timeline. */
export function ColumnChart({ items }: { items: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <p className="text-sm text-ink-muted">Nothing to plot yet.</p>;
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-10 flex-1 flex-col items-center gap-1.5">
          <span className="text-xs tabular-nums text-ink-muted">{item.count}</span>
          <div
            className="w-full rounded-t-sm bg-accent transition-all"
            style={{ height: `${Math.max(4, (item.count / max) * 96)}px` }}
            title={`${item.label}: ${item.count}`}
          />
          <span className="w-full truncate text-center text-[10px] text-ink-muted">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Small donut for a two-way split (e.g. submitted vs outstanding). */
export function Donut({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total ? value / total : 0;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference * (1 - pct);
  return (
    <div className="flex items-center gap-4">
      <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0 -rotate-90">
        <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="10" className="text-page" />
        <circle
          cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round"
          className="text-ink" strokeDasharray={circumference} strokeDashoffset={offset}
        />
      </svg>
      <div>
        <p className="text-2xl font-semibold text-ink">{Math.round(pct * 100)}%</p>
        <p className="text-xs text-ink-muted">{label}</p>
      </div>
    </div>
  );
}
