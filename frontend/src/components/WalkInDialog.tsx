import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import * as Tabs from "@radix-ui/react-tabs";
import { api, ApiError } from "@/lib/api";
import { useQuery, invalidateQuery } from "@/hooks/useQuery";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/cn";
import type { Contact } from "@/lib/types";

export function WalkInDialog({
  open,
  onOpenChange,
  eventId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  onAdded: () => void;
}) {
  const { push } = useToast();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const { data } = useQuery("/contacts", () => api.get<{ contacts: Contact[] }>("/contacts"), { enabled: open });
  const contacts = data?.contacts ?? [];
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedId(null);
      setFullName("");
      setOrganization("");
      setPhone("");
      setError(null);
      setMode("existing");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 20);
    return contacts.filter((c) => c.fullName.toLowerCase().includes(q)).slice(0, 20);
  }, [contacts, query]);

  async function onSubmit() {
    setError(null);
    setSaving(true);
    try {
      const body =
        mode === "existing"
          ? { mode: "existing" as const, contactId: selectedId! }
          : { mode: "new" as const, fullName, organization: organization || null, phone: phone || null };

      await api.post(`/events/${eventId}/walk-in`, body);
      // A walk-in can create a directory entry, so the cached list is stale.
      if (mode === "new") invalidateQuery("/contacts");
      push("Guest added and marked arrived.", "success");
      onAdded();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = mode === "existing" ? !!selectedId : fullName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add guest" description="For someone registering on the spot.">
      <Tabs.Root value={mode} onValueChange={(v) => setMode(v as "existing" | "new")}>
        <Tabs.List className="mb-4 flex gap-1 rounded-control bg-page p-1">
          <Tabs.Trigger
            value="existing"
            className={cn(
              "flex-1 rounded-control py-2 text-sm font-medium tap-target",
              "data-[state=active]:bg-ink data-[state=active]:text-page data-[state=inactive]:text-ink-muted",
            )}
          >
            Search directory
          </Tabs.Trigger>
          <Tabs.Trigger
            value="new"
            className={cn(
              "flex-1 rounded-control py-2 text-sm font-medium tap-target",
              "data-[state=active]:bg-ink data-[state=active]:text-page data-[state=inactive]:text-ink-muted",
            )}
          >
            New person
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="existing" className="space-y-3">
          <Input placeholder="Search by name…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="max-h-56 overflow-y-auto rounded-control border border-hairline">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "flex w-full items-center justify-between border-b border-hairline px-3 py-2.5 text-left last:border-0 hover:bg-page",
                  selectedId === c.id && "bg-status-confirmed-bg",
                )}
              >
                <div>
                  <p className="text-sm font-medium text-ink">{c.fullName}</p>
                  <p className="text-xs text-ink-muted">{c.organization ?? "—"}</p>
                </div>
                {selectedId === c.id && <span className="text-accent-ink">✓</span>}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-4 text-center text-sm text-ink-muted">No matches.</p>}
          </div>
        </Tabs.Content>

        <Tabs.Content value="new" className="space-y-3">
          <div>
            <Label htmlFor="wiName">Full name *</Label>
            <Input id="wiName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="wiOrg">Organization</Label>
            <Input id="wiOrg" value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="wiPhone">Phone</Label>
            <Input id="wiPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </Tabs.Content>
      </Tabs.Root>

      {error && (
        <p role="alert" className="mt-3 rounded-control bg-[rgba(193,8,1,0.1)] px-3 py-2 text-sm text-accent-ink">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={!canSubmit || saving} onClick={onSubmit}>
          {saving ? "Adding…" : "Add guest — mark arrived"}
        </Button>
      </div>
    </Dialog>
  );
}
