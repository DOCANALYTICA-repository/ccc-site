import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BarChart3, ChevronLeft, ChevronRight, LayoutDashboard, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CardChart } from "@/components/surveys/CardChart";
import {
  CARDS_PER_PAGE,
  cardsForPage,
  findCard,
  gridClassFor,
  pageCount,
} from "@/lib/analyticsCards";
import type { Analytics } from "@/lib/surveyAnalytics";

interface EventOption { id: string; name: string }
interface DashboardCard { cardKey: string; position: number }

/** A display board of the analytics charts this admin has pinned.
 *
 * Read-only on purpose: charts are chosen on the analytics screen, so this
 * page can be left open on a projector without a stray click changing what it
 * shows. Six charts fill a page; the rest paginate.
 */
export function AnalyticsDashboardPage() {
  const [params, setParams] = useSearchParams();
  const [eventId, setEventId] = useState(params.get("event") ?? "");
  const [page, setPage] = useState(1);

  const eventsQuery = useQuery("/events", () => api.get<{ events: EventOption[] }>("/events"));
  const events = useMemo(() => eventsQuery.data?.events ?? [], [eventsQuery.data]);

  useEffect(() => {
    setEventId((current) => current || events[0]?.id || "");
  }, [events]);

  const dashboardQuery = useQuery(
    eventId ? `/surveys/events/${eventId}/dashboard` : null,
    () => api.get<{ cards: DashboardCard[] }>(`/surveys/events/${eventId}/dashboard`),
  );
  const analyticsQuery = useQuery(
    eventId ? `/surveys/events/${eventId}/analytics` : null,
    () => api.get<Analytics>(`/surveys/events/${eventId}/analytics`),
  );

  const data = analyticsQuery.data ?? null;
  const pinned = useMemo(() => dashboardQuery.data?.cards ?? [], [dashboardQuery.data]);

  // A pinned key can outlive the thing it named — a question deleted from the
  // template, say. Drop those here so paging and the grid count only charts
  // that will actually draw.
  const resolved = useMemo(() => {
    if (!data) return [];
    return pinned
      .map((card) => ({ card, descriptor: findCard(card.cardKey, data.questions) }))
      .filter((entry): entry is { card: DashboardCard; descriptor: NonNullable<typeof entry.descriptor> } => entry.descriptor !== null);
  }, [pinned, data]);

  const totalPages = pageCount(resolved.length);
  // Clamp rather than trust the URL or a stale page after cards were removed.
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const visible = cardsForPage(resolved, currentPage);

  function chooseEvent(next: string) {
    setEventId(next);
    setPage(1);
    const updated = new URLSearchParams(params);
    updated.set("event", next);
    setParams(updated, { replace: true });
  }

  function refresh() {
    void dashboardQuery.refetch();
    void analyticsQuery.refetch();
  }

  const loading = analyticsQuery.loading || dashboardQuery.loading;
  const noSurvey = !loading && analyticsQuery.error != null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Display</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Admin dashboard</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-11 rounded-control border border-hairline bg-surface px-3 text-sm text-ink"
            value={eventId}
            onChange={(e) => chooseEvent(e.target.value)}
          >
            <option value="">Select event</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
          <Button variant="secondary" onClick={refresh} disabled={!eventId}>
            <RefreshCw className="h-4 w-4" aria-hidden />Refresh
          </Button>
          <Link to={`/survey-analytics?event=${eventId}`}>
            <Button variant="secondary">
              <BarChart3 className="h-4 w-4" aria-hidden />Choose charts
            </Button>
          </Link>
        </div>
      </header>

      {loading && <p className="py-16 text-center text-sm text-ink-muted">Loading dashboard…</p>}

      {noSurvey && (
        <Card className="py-16 text-center">
          <p className="text-sm text-ink-muted">No questionnaire is attached to this event yet.</p>
        </Card>
      )}

      {!loading && !noSurvey && data && resolved.length === 0 && (
        <Card className="space-y-3 py-16 text-center">
          <LayoutDashboard className="mx-auto h-8 w-8 text-ink-muted" aria-hidden />
          <h2 className="text-lg font-semibold text-ink">No analytics tool selected</h2>
          <p className="mx-auto max-w-sm text-sm text-ink-muted">
            Pick the charts you want on display from the analytics screen, and they will appear here.
          </p>
          <div>
            <Link to={`/survey-analytics?event=${eventId}`}>
              <Button><BarChart3 className="h-4 w-4" aria-hidden />Choose charts</Button>
            </Link>
          </div>
        </Card>
      )}

      {!loading && data && resolved.length > 0 && (
        <>
          {/* items-start stops a short chart being stretched to match a tall
              neighbour, which left large dead space inside its card. */}
          <div className={`grid items-start gap-4 ${gridClassFor(visible.length)}`}>
            {visible.map(({ card, descriptor }) => (
              <Card key={card.cardKey} className="flex flex-col p-5">
                <h2 className="text-base font-semibold text-ink">{descriptor.title}</h2>
                <p className="mt-0.5 text-xs text-ink-muted">{descriptor.description}</p>
                <div className="mt-4 flex-1">
                  <CardChart cardKey={card.cardKey} data={data} subset={data.respondents} />
                </div>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />Previous
              </Button>
              <span className="text-sm text-ink-muted">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next<ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-ink-muted">
            {resolved.length} {resolved.length === 1 ? "chart" : "charts"} pinned
            {resolved.length > CARDS_PER_PAGE ? ` · ${CARDS_PER_PAGE} per page` : ""}
          </p>
        </>
      )}
    </div>
  );
}
