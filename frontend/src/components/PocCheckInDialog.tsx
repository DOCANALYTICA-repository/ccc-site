import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, KeyRound, Printer, ScanLine } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/** Starts and manages the POC gate check-in session.
 *
 * The QR is printed once and left standing at the desk all evening, so it is
 * not the credential — the passcode is. That passcode is shown here exactly
 * once, at creation, because it is stored only as a hash: an admin who can
 * read it back out later is one more place it can leak from. Losing it means
 * starting a new session, which is a two-tap operation.
 */

interface PocSession {
  id: string;
  startedAt: string;
  expiresAt: string;
}

export function PocCheckInDialog({
  open,
  onOpenChange,
  eventId,
  eventName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventName: string;
}) {
  const { push } = useToast();
  const [session, setSession] = useState<PocSession | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [passcode, setPasscode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ session: PocSession | null; portalUrl?: string }>(`/events/${eventId}/poc-session`);
      setSession(res.session);
      setPortalUrl(res.portalUrl ?? null);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Could not load the check-in session.", "error");
    } finally {
      setLoading(false);
    }
  }, [eventId, push]);

  useEffect(() => {
    if (!open) return;
    // A newly-shown passcode belongs to one dialog visit only.
    setPasscode(null);
    void load();
  }, [open, load]);

  async function start() {
    setBusy(true);
    try {
      const res = await api.post<{ session: PocSession; passcode: string; portalUrl: string }>(
        `/events/${eventId}/poc-session`,
        {},
      );
      setSession(res.session);
      setPortalUrl(res.portalUrl);
      setPasscode(res.passcode);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Could not start the session.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    setBusy(true);
    try {
      await api.delete(`/events/${eventId}/poc-session`);
      setSession(null);
      setPortalUrl(null);
      setPasscode(null);
      push("Check-in session ended. Every POC's access is now revoked.", "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Could not end the session.", "error");
    } finally {
      setBusy(false);
    }
  }

  function print() {
    if (!portalUrl) return;
    const svg = document.getElementById("poc-qr")?.outerHTML;
    if (!svg) return;
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return push("Allow pop-ups to print the QR sheet.", "error");
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(eventName)} — gate check-in</title>
      <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; text-align: center; padding: 48px 32px; color: #111; }
        h1 { font-size: 28px; margin: 0 0 4px; }
        p  { font-size: 15px; color: #555; margin: 0 0 28px; }
        svg { width: 340px; height: 340px; }
        ol { text-align: left; max-width: 340px; margin: 28px auto 0; font-size: 14px; line-height: 1.7; color: #333; }
      </style></head><body>
      <h1>${escapeHtml(eventName)}</h1>
      <p>Gate check-in — point-of-contacts only</p>
      ${svg}
      <ol>
        <li>Scan this code with your phone camera.</li>
        <li>Enter the check-in passcode you were given.</li>
        <li>Tap <strong>Arrived</strong> as each guest reaches the desk.</li>
      </ol>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="POC gate check-in"
      description="Student point-of-contacts scan this once and mark guests in as they arrive. Guests do not scan anything."
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>
      ) : !session ? (
        <div className="py-4 text-center">
          <ScanLine className="mx-auto h-10 w-10 text-accent-ink" aria-hidden />
          <p className="mx-auto mt-4 max-w-sm text-sm text-ink-muted">
            Starting a session generates the QR poster and a passcode to read out at the POC briefing. It runs for
            12 hours, or until you end it.
          </p>
          <Button className="mt-5" onClick={start} disabled={busy}>
            {busy ? "Starting…" : "Start check-in session"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {passcode && (
            <div className="rounded-control border border-accent bg-page p-4 text-center">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-ink">
                <KeyRound className="h-3.5 w-3.5" aria-hidden />
                Check-in passcode
              </p>
              <p className="mt-2 font-mono text-4xl font-semibold tracking-[0.3em] text-ink">{passcode}</p>
              <p className="mx-auto mt-3 max-w-xs text-xs text-ink-muted">
                Shown once. Write it down and give it to your POCs — it can’t be read back later, only replaced by
                starting a new session.
              </p>
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            {portalUrl ? (
              <div className="rounded-card bg-white p-5">
                <QRCodeSVG id="poc-qr" value={portalUrl} size={240} level="M" />
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Preparing the QR…</p>
            )}
            <p className="max-w-sm text-center text-sm text-ink-muted">
              Print this and keep it at the registration desk. The QR alone opens nothing — a POC still needs the
              passcode.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={print} disabled={!portalUrl}>
              <Printer className="h-4 w-4" aria-hidden />
              Print QR sheet
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!portalUrl}
              onClick={() => {
                if (!portalUrl) return;
                void navigator.clipboard.writeText(portalUrl);
                push("Portal link copied.", "success");
              }}
            >
              <Copy className="h-4 w-4" aria-hidden />
              Copy link
            </Button>
            <Button size="sm" variant="danger" onClick={end} disabled={busy}>
              End session
            </Button>
          </div>

          <p className="text-center text-xs text-ink-muted">
            Expires {new Date(session.expiresAt).toLocaleString()}. Ending the session revokes every POC's access
            immediately.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
