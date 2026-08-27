import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { useAuth, ApiError } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { CccLogo } from "@/components/Logo";

export function ChangePassword() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) return setError("The new passwords do not match.");
    setSaving(true);
    setError(null);
    try {
      await changePassword(currentPassword, newPassword);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change your password.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-page px-4 py-8">
      <div className="w-full max-w-md">
        <CccLogo className="mx-auto mb-8 h-12 w-auto" />
        <Card className="p-6 sm:p-8">
          <KeyRound className="mb-4 h-8 w-8 text-accent-ink" aria-hidden />
          <h1 className="text-2xl font-semibold text-ink">Create your private password</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Your temporary password only unlocks this setup screen. Choose at least 12 characters.
          </p>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <Label htmlFor="currentPassword">Temporary password</Label>
              <Input id="currentPassword" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <Input id="newPassword" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input id="confirmPassword" type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p role="alert" className="rounded-control bg-status-confirmed-bg px-3 py-2 text-sm text-status-confirmed-fg">{error}</p>}
            <Button className="w-full" type="submit" disabled={saving}>{saving ? "Saving…" : "Save password and continue"}</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
