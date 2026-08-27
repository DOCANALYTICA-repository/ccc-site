import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { GATE_STATUS_ORDER, STATUS_ORDER, STATUS_LABELS, StatusChip } from "@/components/StatusChip";
import { WalkInDialog } from "@/components/WalkInDialog";
import { cn } from "@/lib/cn";
import type { EventRecord, Invitation, InvitationStatus } from "@/lib/types";

// A SEPARATE layout from EventDetail, not a squeezed version of it — used
// one-handed, standing, on a phone, possibly on bad venue wifi.
// See PLAN.md section 7.6.

interface PendingChange {
  invitationId: string;
  status: InvitationStatus;
  queuedAt: number;
}

function queueKey(eventId: string) {
  return `ccc-gate-queue-${eventId}`;
}

export function GateCheckIn() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | InvitationStatus>("ALL");
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
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

  useEffect(() => {
    if (!id) return;
    const stored = localStorage.getItem(queueKey(id));
    if (stored) setPending(JSON.parse(stored));
  }, [id]);

  const flushQueue = useCallback(async () => {
    if (!id || pending.length === 0) return;
    const remaining: PendingChange[] = [];
    for (const change of pending) {
      try {
        await api.patch(`/events/${id}/invitations/${change.invitationId}/status`, { status: change.status });
      } catch {
        remaining.push(change);
      }
    }
    setPending(remaining);
    localStorage.setItem(queueKey(id), JSON.stringify(remaining));
    if (remaining.length < pending.length) load();
  }, [id, pending, load]);

  useEffect(() => {
    function goOnline() {
      setOnline(true);
      flushQueue();
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flushQueue]);

  async function setStatus(invId: string, status: InvitationStatus) {
    setInvitations((prev) => prev?.map((i) => (i.id === invId ? { ...i, status } : i)) ?? null);
    if (!id) return;
    try {
      await api.patch(`/events/${id}/invitations/${invId}/status`, { status });
    } catch {
      const next = [...pending, { invitationId: invId, status, queuedAt: Date.now() }];
      setPending(next);
      localStorage.setItem(queueKey(id), JSON.stringify(next));
    }
  }

  const filtered = useMemo(() => {
    if (!invitations) return [];
    const q = query.trim().toLowerCase();
    return invitations.filter((inv) => {
      if (filter !== "ALL" && inv.status !== filter) return false;
      if (!q) return true;
      return inv.contact.fullName.toLowerCase().includes(q) || (inv.contact.organization ?? "").toLowerCase().includes(q);
    });
  }, [invitations, query, filter]);

  const isPending = (invId: string) => pending.some((p) => p.invitationId === invId);

  if (!event || !invitations) return <p className="p-4 text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="sticky top-0 z-20 space-y-2 border-b border-hairline bg-surface px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div>
            <Link to={`/events/${id}`} className="text-xs font-medium text-ink-muted">
              ← Full roster
            </Link>
            <h1 className="text-lg font-semibold text-ink">{event.name}</h1>
          </div>
          {!online && (
            <span className="rounded-full bg-status-confirmed-bg px-2 py-1 text-[10px] font-semibold text-status-confirmed-fg">
              Offline — queuing changes
            </span>
          )}
        </div>
        <input
          placeholder="Search name or company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="tap-target h-12 w-full rounded-control border border-hairline bg-page px-4 text-base text-ink"
        />
        <div className="flex gap-1 overflow-x-auto">
          {(["ALL", ...STATUS_ORDER] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "tap-target shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
                filter === f ? "bg-ink text-page" : "bg-page text-ink-muted",
              )}
            >
              {f === "ALL" ? "All" : STATUS_LABELS[f]}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 divide-y divide-hairline overflow-y-auto pb-24">
        {filtered.map((inv) => (
          <div key={inv.id} className="flex items-center gap-3 bg-surface px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-ink">{inv.contact.fullName}</p>
              <p className="truncate text-xs text-ink-muted">{inv.contact.organization ?? "—"}</p>
            </div>
            {isPending(inv.id) && <span className="text-[10px] text-status-confirmed-fg">syncing…</span>}
            <button
              onClick={() => {
                const idx = GATE_STATUS_ORDER.indexOf(inv.status);
                const next = GATE_STATUS_ORDER[(Math.max(idx, 0) + 1) % GATE_STATUS_ORDER.length]!;
                setStatus(inv.id, next);
              }}
              className="tap-target"
              aria-label={`Cycle status for ${inv.contact.fullName}`}
            >
              <StatusChip status={inv.status} />
            </button>
          </div>
        ))}
        {filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-muted">No matches.</p>}
      </div>

      <button
        onClick={() => setWalkInOpen(true)}
        className="tap-target fixed inset-x-4 z-20 rounded-control bg-ink py-3.5 text-center text-sm font-semibold text-page shadow-panel"
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        + Add walk-in
      </button>

      <WalkInDialog open={walkInOpen} onOpenChange={setWalkInOpen} eventId={id!} onAdded={load} />
    </div>
  );
}
