import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { CccLogo } from "@/components/Logo";

export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");
  const [invitee, setInvitee] = useState<{ email: string; name: string; purpose: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    api
      .get<{ email: string; name: string; purpose: string }>(`/auth/invites/${token}/status`)
      .then((data) => {
        setInvitee(data);
        setStatus("valid");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/accept-invite", { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <CccLogo variant="full" className="h-36 w-auto sm:h-40" />
        </div>

        <Card>
          {status === "loading" && <p className="text-sm text-ink-muted">Checking your link…</p>}

          {status === "invalid" && (
            <>
              <h1 className="mb-2 text-lg font-semibold text-ink">Link invalid or expired</h1>
              <p className="text-sm text-ink-muted">
                Ask an admin to send you a new invite or reset link.
              </p>
              <Link to="/login" className="mt-4 inline-block text-sm font-medium text-accent-ink">
                Back to sign in
              </Link>
            </>
          )}

          {status === "valid" && !done && (
            <>
              <h1 className="mb-1 text-lg font-semibold text-ink">
                {invitee?.purpose === "RESET" ? "Reset your password" : "Set your password"}
              </h1>
              <p className="mb-5 text-sm text-ink-muted">
                {invitee?.name} · {invitee?.email}
              </p>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="password">New password (min 12 characters)</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={12}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    required
                    minLength={12}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                {error && (
                  <p role="alert" className="rounded-control bg-[rgba(193,8,1,0.1)] px-3 py-2 text-sm text-accent-ink">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Saving…" : "Set password"}
                </Button>
              </form>
            </>
          )}

          {done && (
            <>
              <h1 className="mb-2 text-lg font-semibold text-ink">You're all set</h1>
              <p className="mb-4 text-sm text-ink-muted">Your password has been saved.</p>
              <Button className="w-full" onClick={() => navigate("/login")}>
                Sign in
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
