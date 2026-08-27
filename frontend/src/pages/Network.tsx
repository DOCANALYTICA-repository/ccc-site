import { useEffect, useState } from "react";
import { Building2, Check, Clock3, Search, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
    await api.post("/network/connections", { recipientId: person.userId });
    setPeople((items) => items.map((p) => p.userId === person.userId ? { ...p, connection: { id: "pending", status: "PENDING", requesterId: "self" } } : p));
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
            <div className="mt-auto pt-5">
              {!person.connection && <Button className="w-full" onClick={() => request(person)}><UserPlus className="h-4 w-4" aria-hidden />Connect</Button>}
              {person.connection?.status === "PENDING" && <Button className="w-full" disabled variant="secondary"><Clock3 className="h-4 w-4" aria-hidden />Request pending</Button>}
              {person.connection?.status === "ACCEPTED" && <Button className="w-full" disabled variant="secondary"><Check className="h-4 w-4" aria-hidden />Connected</Button>}
            </div>
          </Card>
        ))}
      </div>
      {!loading && !people.length && <p className="py-10 text-center text-sm text-ink-muted">No discoverable profiles match your search.</p>}
    </div>
  );
}
