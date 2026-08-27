import { Check, Circle, Flag, X, type LucideIcon } from "lucide-react";
import type { InvitationStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

const CONFIG: Record<InvitationStatus, { label: string; icon: LucideIcon; bg: string; fg: string }> = {
  UNCONFIRMED: { label: "Unconfirmed", icon: Circle, bg: "bg-status-unconfirmed-bg", fg: "text-status-unconfirmed-fg" },
  CONFIRMED: { label: "Confirmed", icon: Check, bg: "bg-status-confirmed-bg", fg: "text-status-confirmed-fg" },
  DECLINED: { label: "Declined", icon: X, bg: "bg-status-unconfirmed-bg", fg: "text-status-unconfirmed-fg" },
  ARRIVED_IN_CAMPUS: { label: "Arrived", icon: Flag, bg: "bg-status-arrived-bg", fg: "text-status-arrived-fg" },
};

export function StatusChip({ status, className }: { status: InvitationStatus; className?: string }) {
  const c = CONFIG[status];
  const Icon = c.icon;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", c.bg, c.fg, className)}><Icon className="h-3.5 w-3.5" aria-hidden />{c.label}</span>;
}

export const STATUS_ORDER: InvitationStatus[] = ["UNCONFIRMED", "CONFIRMED", "DECLINED", "ARRIVED_IN_CAMPUS"];
export const GATE_STATUS_ORDER: InvitationStatus[] = ["UNCONFIRMED", "CONFIRMED", "ARRIVED_IN_CAMPUS"];
export const STATUS_LABELS: Record<InvitationStatus, string> = {
  UNCONFIRMED: "Unconfirmed",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
  ARRIVED_IN_CAMPUS: "Arrived in Campus",
};
