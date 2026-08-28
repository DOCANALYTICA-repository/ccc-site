import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Card, CardTitle } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import type { EventRecord, EventStatus } from "@/lib/types";

// Deliberate colour per lifecycle stage — draft/grey, active/orange,
// completed/black, cancelled/red-text — status text always accompanies it.
const STATUS_BADGE: Record<EventStatus, string> = {
  DRAFT: "bg-page text-ink-muted",
  ACTIVE: "bg-status-confirmed-bg text-status-confirmed-fg",
  COMPLETED: "bg-status-arrived-bg text-status-arrived-fg",
  CANCELLED: "bg-[rgba(193,8,1,0.12)] text-accent-ink",
};

function formatDate(iso: string | null) {
  if (!iso) return "Date TBD";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function Events() {
  const { data, refetch: load } = useQuery("/events", () => api.get<{ events: EventRecord[] }>("/events"));
  const events = data?.events;
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Events</h1>
          <p className="text-sm text-ink-muted">{events?.length ?? "…"} events.</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ New event</Button>
      </div>

      <div className="space-y-3">
        {events?.map((e) => (
          <Link key={e.id} to={`/events/${e.id}`}>
            <Card className="flex flex-wrap items-center gap-4 border-l-4 border-transparent p-4 transition-colors hover:border-accent hover:bg-page sm:p-5">
              <div className="min-w-[10rem] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="mb-0">{e.name}</CardTitle>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_BADGE[e.status])}>
                    {e.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {e.venue ?? "Venue TBD"} · {formatDate(e.startAt)}
                </p>
                {e.description && (
                  <p className="mt-1 line-clamp-1 text-xs text-ink-muted">{e.description}</p>
                )}
              </div>

              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-lg font-semibold text-ink">{e.invitationCount ?? 0}</p>
                  <p className="text-[10px] uppercase tracking-wide text-ink-muted">Invited</p>
                </div>
                <span className="text-lg text-ink-muted" aria-hidden>→</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {events?.length === 0 && (
        <Card className="py-12 text-center">
          <p className="text-sm font-medium text-ink">No events yet.</p>
          <p className="mt-1 text-sm text-ink-muted">Create your first event to start building a guest list.</p>
          <Button className="mt-4" onClick={() => setOpen(true)}>
            + New event
          </Button>
        </Card>
      )}

      <NewEventDialog open={open} onOpenChange={setOpen} onCreated={load} />
    </div>
  );
}

function NewEventDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post("/events", {
        name,
        venue: venue || null,
        description: description || null,
        startAt: startAt || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Asia/Kolkata",
      });
      setName("");
      setVenue("");
      setDescription("");
      setStartAt("");
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New event">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Event name *</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="venue">Venue</Label>
          <Input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="startAt">Start</Label>
          <Input id="startAt" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="rounded-control bg-[rgba(193,8,1,0.1)] px-3 py-2 text-sm text-accent-ink">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create event"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
