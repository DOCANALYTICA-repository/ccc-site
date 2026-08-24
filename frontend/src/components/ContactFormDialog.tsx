import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api";
import type { Contact, DuplicateWarning } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  onSaved: () => void;
}

const EMPTY = {
  fullName: "",
  organization: "",
  designation: "",
  profileUrl: "",
  email: "",
  phone: "",
  dietaryNotes: "",
  notes: "",
};

export function ContactFormDialog({ open, onOpenChange, contact, onSaved }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<DuplicateWarning[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        contact
          ? {
              fullName: contact.fullName,
              organization: contact.organization ?? "",
              designation: contact.designation ?? "",
              profileUrl: contact.profileUrl ?? "",
              email: contact.email ?? "",
              phone: contact.phone ?? "",
              dietaryNotes: contact.dietaryNotes ?? "",
              notes: contact.notes ?? "",
            }
          : EMPTY,
      );
      setError(null);
      setWarnings([]);
    }
  }, [open, contact]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName,
        organization: form.organization || null,
        designation: form.designation || null,
        profileUrl: form.profileUrl || null,
        email: form.email || null,
        phone: form.phone || null,
        dietaryNotes: form.dietaryNotes || null,
        notes: form.notes || null,
      };
      const res = contact
        ? await api.put<{ warnings: DuplicateWarning[] }>(`/contacts/${contact.id}`, payload)
        : await api.post<{ warnings: DuplicateWarning[] }>("/contacts", payload);

      if (res.warnings.length > 0) {
        setWarnings(res.warnings);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? "Edit contact" : "Add contact"}
      description="Only the name is required."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="fullName">Full name *</Label>
          <Input
            id="fullName"
            required
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="organization">Organization</Label>
            <Input
              id="organization"
              value={form.organization}
              onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="designation">Position</Label>
            <Input
              id="designation"
              value={form.designation}
              onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="profileUrl">LinkedIn / profile URL</Label>
          <Input
            id="profileUrl"
            value={form.profileUrl}
            onChange={(e) => setForm((f) => ({ ...f, profileUrl: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="dietaryNotes">Food preference</Label>
          <Input
            id="dietaryNotes"
            value={form.dietaryNotes}
            onChange={(e) => setForm((f) => ({ ...f, dietaryNotes: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        {warnings.length > 0 && (
          <div className="rounded-control bg-status-confirmed-bg px-3 py-2 text-sm text-status-confirmed-fg">
            Possible duplicate: matches an existing contact on {warnings.map((w) => w.field).join(", ")} (
            {warnings[0]?.contactName}). Saved anyway — review if this wasn't intentional.
          </div>
        )}
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
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
