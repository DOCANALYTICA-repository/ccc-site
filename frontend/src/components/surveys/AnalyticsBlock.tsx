import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";

/** One headed, collapsible analytics section.
 *
 * Every block carries its own heading and a `keywords` blob; the page hides
 * whole blocks whose heading/keywords miss the search query, so searching
 * "industry" narrows the page to the industry views rather than scrolling.
 */
export function AnalyticsBlock({
  id,
  title,
  subtitle,
  action,
  children,
  defaultOpen = true,
}: {
  id: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card id={id} className="scroll-mt-20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 cursor-pointer items-start gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
          <span>
            <span className="block text-lg font-semibold text-ink">{title}</span>
            {subtitle && <span className="mt-0.5 block text-sm text-ink-muted">{subtitle}</span>}
          </span>
        </button>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {open && <div className="mt-5">{children}</div>}
    </Card>
  );
}

/** Compact labelled dropdown used for the per-block sort/breakdown controls. */
export function InlineSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink-muted">
      {label}
      <select
        className="h-8 rounded-control border border-hairline bg-surface px-2 text-xs text-ink"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
