import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BookOpen, CalendarCheck, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Dashboard } from "@/pages/Dashboard";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface HomeInvitation {
  id: string;
  status: "UNCONFIRMED" | "CONFIRMED" | "DECLINED" | "ARRIVED_IN_CAMPUS";
  event: {
    id: string;
    name: string;
    venue: string | null;
    startAt: string | null;
    survey: { id: string; status: "DRAFT" | "OPEN" | "CLOSED"; title: string } | null;
  };
  surveyResponse: { id: string } | null;
}

export function Home() {
  const { user } = useAuth();
  if (user?.role === "ADMIN" || user?.role === "STAFF") return <Dashboard />;
  return <CommunityHome />;
}

function CommunityHome() {
  const { user } = useAuth();
  const [data, setData] = useState<{
    invitations: HomeInvitation[]; unreadNotifications: number; unreadMessages: number; catalogCount: number;
  } | null>(null);

  async function load() {
    setData(await api.get("/community/home"));
  }

  useEffect(() => { load(); }, []);

  async function respond(id: string, decision: "ACCEPT" | "DECLINE") {
    await api.patch(`/community/invitations/${id}/respond`, { decision });
    load();
  }

  if (!data) return <p className="text-sm text-ink-muted">Loading your community home…</p>;
  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">CCC Community</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Welcome, {user?.name}</h1>
        <p className="mt-2 text-sm text-ink-muted">Your invitations, conversations, learning resources, and event follow-ups are all here.</p>
      </header>
      <div className="grid grid-cols-3 gap-3">
        <Metric icon={MessageCircle} label="Unread messages" value={data.unreadMessages} />
        <Metric icon={BookOpen} label="Course catalogs" value={data.catalogCount} />
        <Metric icon={Bell} label="Notifications" value={data.unreadNotifications} />
      </div>
      <section>
        <div className="mb-3 flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-accent-ink" aria-hidden /><h2 className="text-lg font-semibold text-ink">Your events</h2></div>
        <div className="space-y-3">
          {data.invitations.map((inv) => (
            <Card key={inv.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{inv.event.name}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{inv.event.venue ?? "Venue to be confirmed"}{inv.event.startAt ? ` · ${new Date(inv.event.startAt).toLocaleString()}` : ""}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-accent-ink">{inv.status.replaceAll("_", " ")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inv.status !== "ARRIVED_IN_CAMPUS" && <>
                    <Button size="sm" onClick={() => respond(inv.id, "ACCEPT")}>Accept</Button>
                    <Button size="sm" variant="secondary" onClick={() => respond(inv.id, "DECLINE")}>Decline</Button>
                  </>}
                  {inv.status === "CONFIRMED" && <Link to="/check-in"><Button size="sm" variant="secondary">Check in</Button></Link>}
                  {inv.status === "ARRIVED_IN_CAMPUS" && inv.event.survey?.status === "OPEN" && (
                    <Link to={`/events/${inv.event.id}/survey`}><Button size="sm">Complete form</Button></Link>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {!data.invitations.length && <Card className="p-6 text-center text-sm text-ink-muted">No event invitations yet.</Card>}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Bell; label: string; value: number }) {
  return <Card className="p-3 text-center sm:p-5"><Icon className="mx-auto h-5 w-5 text-accent-ink" aria-hidden /><p className="mt-2 text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-[11px] text-ink-muted">{label}</p></Card>;
}
