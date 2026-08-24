import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardTitle, Micro } from "@/components/ui/Card";
import type { EventRecord } from "@/lib/types";

interface Tile {
  event: EventRecord;
  total: number;
  confirmed: number;
  unconfirmed: number;
  arrived: number;
  arrivingSoon: { id: string; contact: { fullName: string; organization: string | null } }[];
}

export function Dashboard() {
  const [tiles, setTiles] = useState<Tile[] | null>(null);

  useEffect(() => {
    api.get<{ tiles: Tile[] }>("/dashboard").then((d) => setTiles(d.tiles));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted">Active and upcoming events at a glance.</p>
      </div>

      {tiles === null && <p className="text-sm text-ink-muted">Loading…</p>}
      {tiles?.length === 0 && (
        <Card>
          <p className="text-sm text-ink-muted">
            No active events yet. <Link to="/events" className="font-medium text-accent-ink">Create one</Link>.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {tiles?.map((tile) => (
          <Link key={tile.event.id} to={`/events/${tile.event.id}`}>
            <Card className="flex flex-wrap items-center gap-4 border-l-4 border-transparent p-4 transition-colors hover:border-accent hover:bg-page sm:p-5">
              <div className="min-w-[10rem] flex-1">
                <CardTitle className="mb-0">{tile.event.name}</CardTitle>
                <p className="mt-1 text-xs text-ink-muted">{tile.event.venue ?? "Venue TBD"}</p>
                {tile.arrivingSoon.length > 0 && (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Arriving soon: {tile.arrivingSoon.slice(0, 3).map((inv) => inv.contact.fullName).join(", ")}
                    {tile.arrivingSoon.length > 3 && ` +${tile.arrivingSoon.length - 3} more`}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-5 text-center sm:gap-6">
                <div>
                  <Micro>Arrived</Micro>
                  <p className="text-xl font-semibold text-ink">{tile.arrived}</p>
                </div>
                <div>
                  <Micro>Confirmed</Micro>
                  <p className="text-xl font-semibold text-status-confirmed-fg">{tile.confirmed}</p>
                </div>
                <div>
                  <Micro>Total</Micro>
                  <p className="text-xl font-semibold text-ink">{tile.total}</p>
                </div>
              </div>

              <span className="text-lg text-ink-muted" aria-hidden>→</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
