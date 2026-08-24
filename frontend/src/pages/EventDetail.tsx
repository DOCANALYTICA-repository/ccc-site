import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import { api, downloadFile, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip, STATUS_ORDER, STATUS_LABELS } from "@/components/StatusChip";
import { InviteDrawer } from "@/components/InviteDrawer";
import { WalkInDialog } from "@/components/WalkInDialog";
import { cn } from "@/lib/cn";
import type { EventRecord, Invitation, InvitationStatus } from "@/lib/types";

// status-arrived-fg is calibrated as the foreground for the black/white
// "Arrived" chip, not as freestanding text — it inverts per theme, so on a
// plain card it can land near-invisible. Everything else here is audited
// safe directly on --surface (see index.css comments), so only that one
// stays on --ink.
const STATUS_FG: Record<InvitationStatus, string> = {
  UNCONFIRMED: "text-status-unconfirmed-fg",
  CONFIRMED: "text-status-confirmed-fg",
  ARRIVED_IN_CAMPUS: "text-ink",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { push } = useToast();

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [tab, setTab] = useState<"ALL" | InvitationStatus>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [eventRes, invRes] = await Promise.all([
      api.get<{ event: EventRecord }>(`/events/${id}`),
      api.get<{ invitations: Invitation[] }>(`/events/${id}/invitations`),
    ]);
    setEvent(eventRes.event);
    setInvitations(invRes.invitations);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<InvitationStatus, number> = { UNCONFIRMED: 0, CONFIRMED: 0, ARRIVED_IN_CAMPUS: 0 };
    invitations?.forEach((inv) => c[inv.status]++);
    return c;
  }, [invitations]);

  const filtered = useMemo(() => {
    if (!invitations) return [];
    return tab === "ALL" ? invitations : invitations.filter((inv) => inv.status === tab);
  }, [invitations, tab]);

  const alreadyInvitedIds = useMemo(() => new Set(invitations?.map((i) => i.contactId) ?? []), [invitations]);

  async function setStatus(invId: string, status: InvitationStatus) {
    // Optimistic update — see PLAN.md section 7 / 5.5.
    setInvitations((prev) => prev?.map((i) => (i.id === invId ? { ...i, status } : i)) ?? null);
    try {
      await api.patch(`/events/${id}/invitations/${invId}/status`, { status });
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Couldn't update status.", "error");
      load();
    }
  }

  async function bulkSetStatus(status: InvitationStatus) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    setInvitations((prev) => prev?.map((i) => (ids.includes(i.id) ? { ...i, status } : i)) ?? null);
    setSelected(new Set());
    try {
      await api.post(`/events/${id}/invitations/bulk-status`, { invitationIds: ids, status });
      push(`Updated ${ids.length} guests to ${STATUS_LABELS[status]}.`, "success");
    } catch {
      push("Couldn't update some statuses.", "error");
      load();
    }
  }

  async function onDeleteEvent() {
    if (!id || !event) return;
    if (!confirm(`Delete "${event.name}"? This removes all ${invitations?.length ?? 0} invitations too.`)) return;
    await api.delete(`/events/${id}?confirm=true`);
    push("Event deleted.", "success");
    navigate("/events");
  }

  function toggleSelect(invId: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(invId) ? next.delete(invId) : next.add(invId);
      return next;
    });
  }

  if (!event || !invitations) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  return (
    <div className="space-y-5">
      {/* Detail-panel header wash — the brand gradient, once per screen, at
          low opacity, per PLAN.md section 7.2. Text sits on its own solid
          Card so the gradient never has to carry contrast on its own. */}
      <div className="brand-gradient-wash overflow-hidden rounded-card p-[1px]">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-card bg-surface p-5">
          <div>
            <Link to="/events" className="text-xs font-medium text-ink-muted hover:text-ink">
              ← Events
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-ink">{event.name}</h1>
            <p className="text-sm text-ink-muted">
              {event.venue ?? "Venue TBD"} · {formatDateTime(event.startAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/events/${id}/gate`}>
              <Button variant="secondary">Gate check-in view</Button>
            </Link>
            <Button variant="secondary" onClick={() => downloadFile(`/events/${id}/export`, "roster-export.xlsx")}>
              Export roster
            </Button>
            <Button variant="secondary" onClick={() => setWalkInOpen(true)}>
              + Add guest
            </Button>
            <Button onClick={() => setInviteOpen(true)}>+ Invite members</Button>
          </div>
        </div>
      </div>

      {/* Attendance gauge — see PLAN.md section 7.1 mapping ("Lead Score" -> attendance) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid grid-cols-3 gap-3 sm:max-w-md sm:flex-1">
          {STATUS_ORDER.map((s) => (
            <Card key={s} className="text-center">
              <p className={cn("text-2xl font-semibold", STATUS_FG[s])}>{counts[s]}</p>
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">{STATUS_LABELS[s]}</p>
            </Card>
          ))}
        </div>
        <Button variant="danger" size="sm" onClick={onDeleteEvent} className="shrink-0">
          Delete event
        </Button>
      </div>

      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <Tabs.List className="flex flex-wrap gap-1 rounded-control bg-page p-1 sm:inline-flex">
          {(["ALL", ...STATUS_ORDER] as const).map((t) => (
            <Tabs.Trigger
              key={t}
              value={t}
              className={cn(
                "rounded-control px-3 py-2 text-sm font-medium tap-target",
                "data-[state=active]:bg-ink data-[state=active]:text-page data-[state=inactive]:text-ink-muted",
              )}
            >
              {t === "ALL" ? `All (${invitations.length})` : `${STATUS_LABELS[t]} (${counts[t]})`}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-control bg-status-confirmed-bg px-3 py-2">
          <span className="text-sm font-medium text-status-confirmed-fg">{selected.size} selected</span>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              className="tap-target rounded-control bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-panel"
              onClick={() => bulkSetStatus(s)}
            >
              Mark {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((inv) => (
          <Card key={inv.id} className="flex flex-wrap items-center gap-3 p-4">
            <input
              type="checkbox"
              className="tap-target h-4 w-4"
              checked={selected.has(inv.id)}
              onChange={() => toggleSelect(inv.id)}
            />
            <div className="min-w-[10rem] flex-1">
              <p className="font-medium text-ink">{inv.contact.fullName}</p>
              <p className="text-xs text-ink-muted">
                {[inv.contact.designation, inv.contact.organization].filter(Boolean).join(" · ") || "—"}
              </p>
              {inv.addedDuringEvent && (
                <span className="mt-1 inline-block rounded-full bg-page px-2 py-0.5 text-[10px] text-ink-muted">
                  Walk-in
                </span>
              )}
            </div>
            <div className="text-xs text-ink-muted">{formatDateTime(inv.arrivalAt)}</div>
            <StatusChip status={inv.status} />
            <div className="flex gap-1">
              {STATUS_ORDER.filter((s) => s !== inv.status).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(inv.id, s)}
                  className="tap-target rounded-control border border-hairline px-2 py-1 text-[11px] font-medium text-ink-muted hover:bg-page"
                >
                  → {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-muted">No guests in this view yet.</p>
        )}
      </div>

      <InviteDrawer
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        eventId={id!}
        alreadyInvitedIds={alreadyInvitedIds}
        onInvited={load}
      />
      <WalkInDialog open={walkInOpen} onOpenChange={setWalkInOpen} eventId={id!} onAdded={load} />
    </div>
  );
}
