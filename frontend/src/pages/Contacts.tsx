import { useMemo, useState } from "react";
import { api, downloadFile } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ContactFormDialog } from "@/components/ContactFormDialog";
import type { Contact } from "@/lib/types";

export function Contacts() {
  const { push } = useToast();
  const { data, refetch: load } = useQuery("/contacts", () => api.get<{ contacts: Contact[] }>("/contacts"));
  const contacts = data?.contacts ?? null;
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  // Whole directory in memory, filtered on every keystroke — see PLAN.md
  // section 5.1: under 100 rows, this is faster than round-tripping search.
  const filtered = useMemo(() => {
    if (!contacts) return [];
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.fullName, c.organization, c.designation, c.email, c.phone]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(q)),
    );
  }, [contacts, query]);

  async function onDelete(c: Contact) {
    if (!confirm(`Remove ${c.fullName} from the directory?`)) return;
    await api.delete(`/contacts/${c.id}`);
    push(`${c.fullName} removed.`, "success");
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Contacts</h1>
          <p className="text-sm text-ink-muted">{contacts?.length ?? "…"} people in the directory.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => downloadFile("/contacts/export", "contacts-export.xlsx")}
          >
            Export
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            + Add contact
          </Button>
        </div>
      </div>

      <Input
        placeholder="Search name, company, email, phone…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      {contacts === null && <p className="text-sm text-ink-muted">Loading…</p>}

      {/* Desktop / tablet: table. Mobile: card stack. PLAN.md section 7.5. */}
      <Card className="hidden overflow-x-auto p-0 sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-hairline last:border-0 hover:bg-page">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{c.fullName}</p>
                  {c.designation && <p className="text-xs text-ink-muted">{c.designation}</p>}
                </td>
                <td className="px-4 py-3 text-ink">{c.organization ?? "—"}</td>
                <td className="px-4 py-3 text-ink-muted">
                  <div>{c.email ?? "—"}</div>
                  <div>{c.phone ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    className="tap-target px-2 text-xs font-medium text-accent-ink"
                    onClick={() => {
                      setEditing(c);
                      setDialogOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="tap-target px-2 text-xs font-medium text-ink-muted"
                    onClick={() => onDelete(c)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="space-y-3 sm:hidden">
        {filtered.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-ink">{c.fullName}</p>
                {c.designation && <p className="text-xs text-ink-muted">{c.designation}</p>}
                {c.organization && <p className="text-xs text-ink-muted">{c.organization}</p>}
              </div>
              <div className="flex shrink-0 gap-3">
                <button
                  className="tap-target text-xs font-medium text-accent-ink"
                  onClick={() => {
                    setEditing(c);
                    setDialogOpen(true);
                  }}
                >
                  Edit
                </button>
                <button className="tap-target text-xs font-medium text-ink-muted" onClick={() => onDelete(c)}>
                  Remove
                </button>
              </div>
            </div>
            <div className="mt-2 space-y-0.5 text-xs text-ink-muted">
              {c.email && <p>{c.email}</p>}
              {c.phone && <p>{c.phone}</p>}
            </div>
          </Card>
        ))}
      </div>

      {contacts && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-ink-muted">No contacts match "{query}".</p>
      )}

      <ContactFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={editing}
        onSaved={load}
      />
    </div>
  );
}
