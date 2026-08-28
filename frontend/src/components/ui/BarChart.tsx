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
