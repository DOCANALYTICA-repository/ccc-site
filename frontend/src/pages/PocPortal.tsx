import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, LockKeyhole, RotateCcw, ScanLine, Search, Undo2, WifiOff } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

/** The student point-of-contact gate portal.
 *
 * A dead end on purpose. There is no link back into the application, no nav
 * chrome, and no session cookie involved: a POC holds a scoped token that can
 * read this one roster and mark arrivals, nothing more. Everything it writes
 * lands in the same tables staff read, so the main app sees arrivals live.
 *
 * The layout assumes the worst realistic conditions — one hand, standing,
 * bright sun, a queue forming, patchy venue wifi — so rows are large, the
 * search box is always in reach, and a failed write is queued and retried
 * rather than lost.
 */

const API_BASE = (String(import.meta.env.VITE_API_URL ?? "").trim() || "/api").replace(/\/$/, "");
const TOKEN_KEY = "ccc-poc-portal-token";
const ACCESS_KEY = "ccc-poc-access-token";
const QUEUE_KEY = "ccc-poc-queue";

type Status = "UNCONFIRMED" | "CONFIRMED" | "DECLINED" | "ARRIVED_IN_CAMPUS";

interface Row {
  id: string;
  status: Status;
  contact: { fullName: string; organization: string | null; designation: string | null };
}

interface EventInfo {
  name: string;
  venue: string | null;
  startAt: string | null;
}

interface QueuedMark {
  invitationId: string;
  status: Status;
}

/** /poc sits outside RouteErrorBoundary by design — it has no app chrome to
 * fall back into — so nothing here may throw during render. A half-written
 * queue entry must cost one lost retry, not a white screen at the gate. */
function readQueue(): QueuedMark[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((q) => q && typeof q.invitationId === "string") : [];
  } catch {
    localStorage.removeItem(QUEUE_KEY);
    return [];
  }
}

async function pocFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/poc${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, (isJson && body?.error) || `Request failed (${res.status})`);
  return body as T;
}

export function PocPortal() {
  // The QR carries the portal token in the URL. Stash it and strip it, so a
  // POC who reloads or backgrounds the page doesn't have to rescan, and so a
  // shoulder-surfer doesn't read it out of the address bar.
  const [portalToken, setPortalToken] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("t");
    if (fromUrl) {
      localStorage.setItem(TOKEN_KEY, fromUrl);
      window.history.replaceState(null, "", window.location.pathname);
      return fromUrl;
    }
    return localStorage.getItem(TOKEN_KEY) ?? "";
  });
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(ACCESS_KEY) ?? "");
  const [event, setEvent] = useState<EventInfo | null>(null);

  const [lockError, setLockError] = useState<string | null>(null);

  // Stable across renders: the roster's loader depends on it, and a fresh
  // identity every render would turn its load effect into a request loop.
  const signOut = useCallback((message?: string) => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(QUEUE_KEY);
    setAccessToken("");
    setEvent(null);
    if (message) setLockError(message);
  }, []);

  if (!portalToken) {
    return (
      <Shell>
        <div className="text-center">
          <ScanLine className="mx-auto h-12 w-12 text-accent-ink" aria-hidden />
          <h1 className="mt-5 text-2xl font-semibold text-ink">Scan the check-in QR</h1>
          <p className="mt-3 text-sm text-ink-muted">
            Open this page by scanning the check-in QR code at the registration desk.
          </p>
        </div>
      </Shell>
    );
  }

  if (!accessToken) {
    return (
      <Unlock
        portalToken={portalToken}
        error={lockError}
        onExpired={() => {
          localStorage.removeItem(TOKEN_KEY);
          setPortalToken("");
        }}
        onUnlocked={(token, info) => {
          localStorage.setItem(ACCESS_KEY, token);
          setAccessToken(token);
          setEvent(info);
          setLockError(null);
        }}
      />
    );
  }

  return <Roster accessToken={accessToken} event={event} onSignOut={signOut} />;
}

// -------------------- Passcode --------------------

function Unlock({
  portalToken,
  error,
  onUnlocked,
  onExpired,
}: {
  portalToken: string;
  error: string | null;
  onUnlocked: (token: string, event: EventInfo) => void;
  onExpired: () => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(error);

  useEffect(() => setMessage(error), [error]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/poc/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: portalToken, passcode }),
      });
      const body = await res.json();
      if (!res.ok) {
        // A 400 here means the QR itself is dead, not the passcode — send them
        // back to rescan rather than letting them retype a code forever.
        if (res.status === 400) onExpired();
        throw new Error(body?.error ?? "Could not open the portal.");
      }
      onUnlocked(body.accessToken, body.event);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not open the portal.");
      setPasscode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} className="text-center">
        <LockKeyhole className="mx-auto h-12 w-12 text-accent-ink" aria-hidden />
        <h1 className="mt-5 text-2xl font-semibold text-ink">Check-in passcode</h1>
        <p className="mt-2 text-sm text-ink-muted">Enter the passcode you were given at the briefing.</p>
        <label htmlFor="poc-passcode" className="sr-only">
          Check-in passcode
        </label>
        <input
          id="poc-passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 8))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="••••••"
          className="mt-6 h-16 w-full rounded-control border border-hairline bg-surface text-center text-3xl font-semibold tracking-[0.4em] text-ink"
        />
        {message && (
          <p role="alert" className="mt-4 text-sm font-medium text-accent-ink">
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || passcode.length < 4}
          className="tap-target mt-6 h-14 w-full rounded-control bg-ink text-base font-semibold text-page disabled:opacity-40"
        >
          {busy ? "Opening…" : "Open check-in"}
        </button>
      </form>
    </Shell>
  );
}

// -------------------- Roster --------------------

function Roster({
  accessToken,
  event,
  onSignOut,
}: {
  accessToken: string;
  event: EventInfo | null;
  onSignOut: (message?: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [eventInfo, setEventInfo] = useState(event);
  const [query, setQuery] = useState("");
  const [showArrived, setShowArrived] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<QueuedMark[]>(readQueue);
  const [error, setError] = useState<string | null>(null);

  // Functional form throughout: at a gate, taps arrive faster than requests
  // fail, and a stale closure here silently drops someone's arrival.
  //
  // Returning `prev` unchanged when nothing moved matters more than it looks:
  // a filter always yields a fresh array, and handing React a new identity on
  // every failed retry would re-run the retry effect immediately, turning a
  // paced 15-second retry into a request loop against a gate's bad wifi.
  const persistQueue = (update: (prev: QueuedMark[]) => QueuedMark[]) => {
    setQueue((prev) => {
      const next = update(prev);
      if (next.length === prev.length && next.every((n, i) => n.invitationId === prev[i]?.invitationId && n.status === prev[i]?.status)) {
        return prev;
      }
      localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const load = useCallback(async () => {
    try {
      const res = await pocFetch<{ invitations: Row[] }>("/roster", accessToken);
      setRows(res.invitations);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignOut(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load the guest list.");
    }
  }, [accessToken, onSignOut]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!eventInfo) return;
    document.title = `${eventInfo.name} — Check-in`;
  }, [eventInfo]);

  // The event name comes back only from /unlock, so a POC returning to a
  // still-valid access token would otherwise see an unlabelled roster.
  useEffect(() => {
    if (eventInfo || !rows) return;
    setEventInfo({ name: "Event check-in", venue: null, startAt: null });
  }, [rows, eventInfo]);

  const flush = useCallback(async () => {
    if (queue.length === 0) return;
    const remaining: QueuedMark[] = [];
    for (const item of queue) {
      try {
        await pocFetch("/check-in", accessToken, { method: "POST", body: JSON.stringify(item) });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) continue; // gone for good; drop it
        remaining.push(item);
      }
    }
    persistQueue((prev) => prev.filter((p) => remaining.some((r) => r.invitationId === p.invitationId)));
    if (remaining.length < queue.length) void load();
  }, [queue, accessToken, load]);

  useEffect(() => {
    function goOnline() {
      setOnline(true);
      void flush();
    }
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flush]);

  // The online event is not enough on its own. A queue restored from a
  // previous visit would never be retried, and neither would a write that
  // failed while the browser still believed it was online — which is most of
  // what bad venue wifi actually looks like. So drain it on mount and keep
  // trying on a timer for as long as anything is outstanding.
  //
  // Read through a ref rather than depending on `flush`: flush changes
  // identity whenever the queue does, and depending on it here would restart
  // the timer on every attempt instead of pacing them.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    if (queue.length === 0) return;
    void flushRef.current();
    const timer = window.setInterval(() => void flushRef.current(), 15_000);
    return () => window.clearInterval(timer);
  }, [queue.length]);

  async function mark(row: Row, status: Status) {
    setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, status } : r)) ?? null);
    try {
      await pocFetch("/check-in", accessToken, {
        method: "POST",
        body: JSON.stringify({ invitationId: row.id, status }),
      });
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignOut(err.message);
        return;
      }
      // Keep the optimistic row and retry later: a POC who sees a guest walk
      // past should not have to remember which taps the network swallowed.
      persistQueue((prev) => [...prev.filter((q) => q.invitationId !== row.id), { invitationId: row.id, status }]);
    }
  }

  const counts = useMemo(() => {
    const total = rows?.length ?? 0;
    const arrived = rows?.filter((r) => r.status === "ARRIVED_IN_CAMPUS").length ?? 0;
    return { total, arrived };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showArrived && r.status === "ARRIVED_IN_CAMPUS") return false;
      if (!q) return true;
      return (
        r.contact.fullName.toLowerCase().includes(q) ||
        (r.contact.organization ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, showArrived]);

  const pending = (id: string) => queue.some((q) => q.invitationId === id);

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="sticky top-0 z-20 space-y-3 border-b border-hairline bg-surface px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-ink">Gate check-in</p>
            <h1 className="truncate text-lg font-semibold text-ink">{eventInfo?.name ?? "Loading…"}</h1>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold tabular-nums text-ink">
              {counts.arrived}
              <span className="text-base font-normal text-ink-muted">/{counts.total}</span>
            </p>
            <p className="text-[11px] text-ink-muted">arrived</p>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or company…"
            aria-label="Search the guest list"
            className="tap-target h-12 w-full rounded-control border border-hairline bg-page pl-11 pr-4 text-base text-ink"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArrived((v) => !v)}
            className={cn(
              "tap-target rounded-full px-3 py-1.5 text-xs font-semibold",
              showArrived ? "bg-ink text-page" : "bg-page text-ink-muted",
            )}
          >
            {showArrived ? "Showing everyone" : "Hiding arrived"}
          </button>
          <button
            onClick={() => void load()}
            className="tap-target rounded-full bg-page px-3 py-1.5 text-xs font-semibold text-ink-muted"
          >
            <RotateCcw className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
          {!online && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-status-unconfirmed-bg px-2 py-1 text-[10px] font-semibold text-status-unconfirmed-fg">
              <WifiOff className="h-3 w-3" aria-hidden /> Offline
            </span>
          )}
          {online && queue.length > 0 && (
            <span className="ml-auto text-[10px] font-semibold text-ink-muted">{queue.length} syncing…</span>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className="border-b border-hairline bg-status-unconfirmed-bg px-4 py-2 text-sm text-status-unconfirmed-fg">
          {error}
        </p>
      )}

      <div className="flex-1 divide-y divide-hairline">
        {rows === null && <p className="px-4 py-10 text-center text-sm text-ink-muted">Loading the guest list…</p>}

        {rows !== null &&
          filtered.map((row) => (
            <div key={row.id} className="flex items-center gap-3 bg-surface px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-ink">{row.contact.fullName}</p>
                <p className="truncate text-xs text-ink-muted">
                  {[row.contact.designation, row.contact.organization].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {pending(row.id) && <span className="text-[10px] text-ink-muted">syncing</span>}
              {row.status === "ARRIVED_IN_CAMPUS" ? (
                <button
                  onClick={() => void mark(row, "CONFIRMED")}
                  aria-label={`Undo arrival for ${row.contact.fullName}`}
                  className="tap-target inline-flex h-12 items-center gap-1.5 rounded-control bg-status-arrived-bg px-3 text-sm font-semibold text-status-arrived-fg"
                >
                  <Undo2 className="h-4 w-4" aria-hidden />
                  Undo
                </button>
              ) : (
                <button
                  onClick={() => void mark(row, "ARRIVED_IN_CAMPUS")}
                  aria-label={`Mark ${row.contact.fullName} as arrived`}
                  className="tap-target inline-flex h-12 items-center gap-1.5 rounded-control bg-ink px-4 text-sm font-semibold text-page"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Arrived
                </button>
              )}
            </div>
          ))}

        {rows !== null && filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">
            {query ? "Nobody matches that search." : "Everyone on the list has arrived."}
          </p>
        )}
      </div>

      <footer className="border-t border-hairline bg-surface px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center">
        <p className="text-xs text-ink-muted">
          Can't find someone? Send them to the registration desk — walk-ins are added by staff.
        </p>
      </footer>
    </div>
  );
}

// -------------------- Layout --------------------

/** No nav, no logo link, no route out. The portal is a terminal screen. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page px-5 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
