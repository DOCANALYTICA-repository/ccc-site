import { useEffect, useState } from "react";
import { Building2, Check, Clock3, ExternalLink, Mail, MessageCircle, Search, UserPlus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";

interface Person {
  userId: string;
  displayName: string;
  organization: string | null;
  designation?: string;
  headline?: string;
  bio?: string;
  publicEmail?: string;
  linkedInUrl?: string;
  connection: { id: string; status: string; requesterId: string } | null;
}

export function NetworkPage() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      api.get<{ people: Person[] }>(`/network/people?q=${encodeURIComponent(query)}`)
        .then((r) => setPeople(r.people)).finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function request(person: Person) {
    const { connection } = await api.post<{ connection: { id: string; status: string; requesterId: string } }>("/network/connections", { recipientId: person.userId });
    setPeople((items) => items.map((p) => p.userId === person.userId ? { ...p, connection } : p));
  }

  async function respond(person: Person, action: "ACCEPT" | "DECLINE") {
    if (!person.connection) return;
    const { connection } = await api.patch<{ connection: { id: string; status: string; requesterId: string } }>(
      `/network/connections/${person.connection.id}`,
      { action },
    );
    setPeople((items) => items.map((p) => p.userId === person.userId ? { ...p, connection } : p));
  }

  return (
    <div className="space-y-5">
      <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">People</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Build your CCC network</h1><p className="mt-2 text-sm text-ink-muted">Profiles reveal only name and organisation until a connection is accepted.</p></header>
      <div className="relative max-w-xl"><Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-ink-muted" aria-hidden /><Input aria-label="Search people" className="pl-10" placeholder="Search by name or organisation…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {people.map((person) => (
          <Card key={person.userId} className="flex flex-col p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-sm font-semibold text-page">{person.displayName.split(" ").map((n) => n[0]).slice(0, 2).join("")}</div>
            <h2 className="mt-4 text-lg font-semibold text-ink">{person.displayName}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted"><Building2 className="h-4 w-4" aria-hidden />{person.organization ?? "Independent"}</p>
            {person.designation && <p className="mt-3 text-sm font-medium text-ink">{person.designation}</p>}
            {person.headline && <p className="mt-1 text-sm text-ink-muted">{person.headline}</p>}
            {person.bio && <p className="mt-3 line-clamp-3 text-sm text-ink-muted">{person.bio}</p>}
            {(person.publicEmail || person.linkedInUrl) && (
              <div className="mt-3 space-y-1.5">
                {person.publicEmail && (
                  <a href={`mailto:${person.publicEmail}`} className="flex items-center gap-1.5 text-sm text-accent-ink hover:underline">
                    <Mail className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{person.publicEmail}</span>
                  </a>
                )}
                {person.linkedInUrl && (
                  <a href={person.linkedInUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-accent-ink hover:underline">
                    <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">LinkedIn profile</span>
                  </a>
                )}
              </div>
            )}
            <div className="mt-auto pt-5">
              {!person.connection && <Button className="w-full" onClick={() => request(person)}><UserPlus className="h-4 w-4" aria-hidden />Connect</Button>}
              {person.connection?.status === "PENDING" && person.connection.requesterId === user?.id && (
                <Button className="w-full" disabled variant="secondary"><Clock3 className="h-4 w-4" aria-hidden />Request pending</Button>
              )}
              {person.connection?.status === "PENDING" && person.connection.requesterId !== user?.id && (
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => respond(person, "ACCEPT")}><Check className="h-4 w-4" aria-hidden />Accept</Button>
                  <Button className="flex-1" variant="secondary" onClick={() => respond(person, "DECLINE")}><X className="h-4 w-4" aria-hidden />Decline</Button>
                </div>
              )}
              {person.connection?.status === "ACCEPTED" && (
                <Link to="/messages">
                  <Button className="w-full" variant="secondary"><MessageCircle className="h-4 w-4" aria-hidden />Message</Button>
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
      {!loading && !people.length && <p className="py-10 text-center text-sm text-ink-muted">No discoverable profiles match your search.</p>}
    </div>
  );
}
