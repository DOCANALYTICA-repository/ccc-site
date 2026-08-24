import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardTitle } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";

interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "STAFF";
  isActive: boolean;
  hasAcceptedInvite: boolean;
  lastLoginAt: string | null;
}

export function Users() {
  const { user: me } = useAuth();
  const { push } = useToast();
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ title: string; link: string } | null>(null);

  async function load() {
    const { users } = await api.get<{ users: StaffUser[] }>("/users");
    setUsers(users);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(u: StaffUser) {
    if (u.id === me?.id) return;
    await api.patch(`/users/${u.id}`, { isActive: !u.isActive });
    push(`${u.name} ${u.isActive ? "deactivated" : "reactivated"}.`, "success");
    load();
  }

  async function sendResetLink(u: StaffUser) {
    const res = await api.post<{ resetLink: string }>(`/auth/users/${u.id}/reset-link`);
    setLinkDialog({ title: `Reset link for ${u.name}`, link: res.resetLink });
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Staff accounts</h1>
          <p className="text-sm text-ink-muted">
            No public signup — every account starts as an admin-issued invite link. See PLAN.md section 6.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>+ Invite</Button>
      </div>

      <Card className="divide-y divide-hairline p-0">
        {users?.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink">
                {u.name} {u.id === me?.id && <span className="text-ink-muted">(you)</span>}
              </p>
              <p className="text-xs text-ink-muted">
                {u.email} · {u.role}
                {!u.isActive && " · deactivated"}
                {!u.hasAcceptedInvite && " · invite pending"}
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              <button className="font-medium text-accent-ink" onClick={() => sendResetLink(u)}>
                Reset link
              </button>
              {u.id !== me?.id && (
                <button
                  className="font-medium text-ink-muted"
                  onClick={() => toggleActive(u)}
                >
                  {u.isActive ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </div>
          </div>
        ))}
      </Card>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onCreated={(link) => {
          load();
          setLinkDialog({ title: "Invite link", link });
        }}
      />

      {linkDialog && (
        <Dialog open onOpenChange={() => setLinkDialog(null)} title={linkDialog.title} description="Copy this link and send it directly — nothing is emailed automatically.">
          <div className="flex items-center gap-2">
            <Input readOnly value={linkDialog.link} onFocus={(e) => e.target.select()} />
            <Button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(linkDialog.link);
                push("Copied to clipboard.", "success");
              }}
            >
              Copy
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (link: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"ADMIN" | "STAFF">("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await api.post<{ inviteLink: string }>("/auth/invites", { email, name, role });
      setEmail("");
      setName("");
      setRole("STAFF");
      onOpenChange(false);
      onCreated(res.inviteLink);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Invite a staff member">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="invName">Name</Label>
          <Input id="invName" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="invEmail">Email</Label>
          <Input id="invEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="invRole">Role</Label>
          <select
            id="invRole"
            value={role}
            onChange={(e) => setRole(e.target.value as "ADMIN" | "STAFF")}
            className="tap-target w-full rounded-control border border-hairline bg-surface px-3 py-2 text-sm"
          >
            <option value="STAFF">Staff</option>
            <option value="ADMIN">Admin</option>
          </select>
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
            {saving ? "Creating…" : "Create invite"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
