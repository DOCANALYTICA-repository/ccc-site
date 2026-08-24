import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import type { Contact } from "@/lib/types";

export function InviteDrawer({
  open,
  onOpenChange,
  eventId,
  alreadyInvitedIds,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  alreadyInvitedIds: Set<string>;
  onInvited: () => void;
}) {
  const { push } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [arrivalAt, setArrivalAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      api.get<{ contacts: Contact[] }>("/contacts").then((d) => setContacts(d.contacts));
      setSelected(new Set());
      setQuery("");
      setArrivalAt("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? contacts.filter((c) =>
          [c.fullName, c.organization, c.designation].filter(Boolean).some((f) => f!.toLowerCase().includes(q)),
        )
      : contacts;
    return base;
  }, [contacts, query]);

  const selectableFiltered = filtered.filter((c) => !alreadyInvitedIds.has(c.id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // "Select all matching filter" — PLAN.md section 5.4.
  function selectAllFiltered() {
    setSelected((s) => new Set([...s, ...selectableFiltered.map((c) => c.id)]));
  }

  async function onSubmit() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const res = await api.post<{ created: number; alreadyInvited: number }>(`/events/${eventId}/invitations`, {
        contactIds: Array.from(selected),
        arrivalAt: arrivalAt || null,
      });
      push(`Invited ${res.created} ${res.created === 1 ? "person" : "people"}.`, "success");
      onInvited();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite members"
      description="Search the directory and select who to invite."
      className="w-[min(640px,92vw)]"
    >
      <div className="space-y-4">
        <Input placeholder="Search name, company…" value={query} onChange={(e) => setQuery(e.target.value)} />

        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{selected.size} selected</span>
          <button type="button" className="font-medium text-accent-ink" onClick={selectAllFiltered}>
            Select all matching filter ({selectableFiltered.length})
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-control border border-hairline">
          {filtered.map((c) => {
            const already = alreadyInvitedIds.has(c.id);
            return (
              <label
                key={c.id}
                className={`flex items-center gap-3 border-b border-hairline px-3 py-2.5 last:border-0 ${
                  already ? "opacity-40" : "cursor-pointer hover:bg-page"
                }`}
              >
                <input
                  type="checkbox"
                  className="tap-target h-4 w-4"
                  disabled={already}
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{c.fullName}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {[c.designation, c.organization].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {already && <span className="text-[10px] text-ink-muted">Already invited</span>}
              </label>
            );
          })}
          {filtered.length === 0 && <p className="px-3 py-4 text-center text-sm text-ink-muted">No matches.</p>}
        </div>

        <div>
          <Label htmlFor="bulkArrival">Set arrival time for selected (optional)</Label>
          <Input
            id="bulkArrival"
            type="datetime-local"
            value={arrivalAt}
            onChange={(e) => setArrivalAt(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={selected.size === 0 || saving} onClick={onSubmit}>
            {saving ? "Inviting…" : `Invite ${selected.size || ""}`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
