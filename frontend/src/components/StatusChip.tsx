import type { InvitationStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

// Icon + text always accompany the colour — status must never rely on hue
// alone. See PLAN.md section 7.3 / 7.7.
const CONFIG: Record<InvitationStatus, { label: string; icon: string; bg: string; fg: string }> = {
  UNCONFIRMED: { label: "Unconfirmed", icon: "○", bg: "bg-status-unconfirmed-bg", fg: "text-status-unconfirmed-fg" },
  CONFIRMED: { label: "Confirmed", icon: "✓", bg: "bg-status-confirmed-bg", fg: "text-status-confirmed-fg" },
  ARRIVED_IN_CAMPUS: { label: "Arrived", icon: "⚑", bg: "bg-status-arrived-bg", fg: "text-status-arrived-fg" },
};

export function StatusChip({ status, className }: { status: InvitationStatus; className?: string }) {
  const c = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        c.bg,
        c.fg,
        className,
      )}
    >
      <span aria-hidden>{c.icon}</span>
      {c.label}
    </span>
  );
}

export const STATUS_ORDER: InvitationStatus[] = ["UNCONFIRMED", "CONFIRMED", "ARRIVED_IN_CAMPUS"];
export const STATUS_LABELS: Record<InvitationStatus, string> = {
  UNCONFIRMED: "Unconfirmed",
  CONFIRMED: "Confirmed",
  ARRIVED_IN_CAMPUS: "Arrived in Campus",
};
