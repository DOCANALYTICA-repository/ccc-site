import { useState } from "react";
import { Bell, Check, CheckCheck, ClipboardCheck, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, invalidateQueries } from "@/hooks/useQuery";

interface Notice {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
}

interface ConnectionSummary {
  id: string;
  status: string;
  recipientId: string;
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const notices = useQuery("/notifications", () => api.get<{ notifications: Notice[] }>("/notifications"));
  // A CONNECTION_REQUEST notice keeps that type forever even after the
  // request has been accepted/declined (possibly from the People page in
  // another tab) — cross-check live connection status before showing
  // Accept/Decline so we never act on a request that's already resolved.
  const conns = useQuery("/network/connections", () => api.get<{ connections: ConnectionSummary[] }>("/network/connections"));
  const [acting, setActing] = useState<string | null>(null);

  const items = notices.data?.notifications ?? [];
  const connections: Record<string, ConnectionSummary> = Object.fromEntries(
    (conns.data?.connections ?? []).map((c) => [c.id, c]),
  );

  async function load() {
    await Promise.all([notices.refetch(), conns.refetch()]);
  }
  async function readAll() {
    await api.post("/notifications/read-all");
    // Also clears the unread badge the shell keeps under /notifications?limit=1.
    invalidateQueries("/notifications");
  }

  async function markRead(item: Notice) {
    if (!item.readAt) await api.patch(`/notifications/${item.id}/read`);
  }

  function openNotice(item: Notice) {
    markRead(item).then(() => invalidateQueries("/notifications"));
    // A survey notice carries its EVENT id, so it can open the form itself
    // instead of falling through to the generic People redirect below.
    if (item.type === "SURVEY_OPENED" && item.entityId) {
      navigate(`/events/${item.entityId}/survey`);
      return;
    }
    // Anything besides a still-open connection request just links to People —
    // e.g. an already-accepted/declined request, or a message/invite notice.
    if (item.type !== "CONNECTION_REQUEST") navigate("/network");
  }

  async function respond(item: Notice, action: "ACCEPT" | "DECLINE") {
    if (!item.entityId) return;
    setActing(item.id);
    try {
      await api.patch(`/network/connections/${item.entityId}`, { action });
      await markRead(item);
      await load();
      invalidateQueries("/network/people");
    } catch (err) {
      // Most likely someone else already accepted/declined this request
      // (or it was cancelled) between the notification loading and the click.
      alert(err instanceof ApiError ? err.message : "Could not respond to that request.");
      await load();
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Updates</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Notifications</h1>
        </div>
        <Button variant="secondary" onClick={readAll}><CheckCheck className="h-4 w-4" aria-hidden />Mark all read</Button>
      </header>
      <div className="space-y-2">
        {items.map((item) => {
          const conn = item.entityId ? connections[item.entityId] : undefined;
          const pendingRequest =
            item.type === "CONNECTION_REQUEST" && conn?.status === "PENDING" && conn.recipientId === user?.id;
          const surveyOpened = item.type === "SURVEY_OPENED" && item.entityId;
          return (
            <Card
              key={item.id}
              onClick={pendingRequest ? undefined : () => openNotice(item)}
              className={`flex gap-3 p-4 transition ${pendingRequest ? "" : "cursor-pointer hover:border-ink/20"} ${item.readAt ? "opacity-70" : "border-l-4 border-l-accent"}`}
            >
              <Bell className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden />
              <div className="flex-1">
                <h2 className="font-medium text-ink">{item.title}</h2>
                {item.body && <p className="mt-1 text-sm text-ink-muted">{item.body}</p>}
                <p className="mt-2 text-xs text-ink-muted">{new Date(item.createdAt).toLocaleString()}</p>
                {pendingRequest && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      className="flex-1 sm:flex-none"
                      disabled={acting === item.id}
                      onClick={() => respond(item, "ACCEPT")}
                    >
                      <Check className="h-4 w-4" aria-hidden />Accept
                    </Button>
                    <Button
                      className="flex-1 sm:flex-none"
                      variant="secondary"
                      disabled={acting === item.id}
                      onClick={() => respond(item, "DECLINE")}
                    >
                      <X className="h-4 w-4" aria-hidden />Decline
                    </Button>
                  </div>
                )}
                {surveyOpened && (
                  <div className="mt-3">
                    <Button
                      className="flex-1 sm:flex-none"
                      onClick={(e) => { e.stopPropagation(); openNotice(item); }}
                    >
                      <ClipboardCheck className="h-4 w-4" aria-hidden />Open form
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        {!items.length && <p className="py-10 text-center text-sm text-ink-muted">You’re all caught up.</p>}
      </div>
    </div>
  );
}
