import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface Notice { id: string; title: string; body: string | null; readAt: string | null; createdAt: string; }

export function NotificationsPage() {
  const [items, setItems] = useState<Notice[]>([]);
  async function load() { setItems((await api.get<{ notifications: Notice[] }>("/notifications")).notifications); }
  useEffect(() => { load(); }, []);
  async function readAll() { await api.post("/notifications/read-all"); load(); }
  return <div className="space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Updates</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Notifications</h1></div><Button variant="secondary" onClick={readAll}><CheckCheck className="h-4 w-4" aria-hidden />Mark all read</Button></header><div className="space-y-2">{items.map((item) => <Card key={item.id} className={`flex gap-3 p-4 ${item.readAt ? "opacity-70" : "border-l-4 border-l-accent"}`}><Bell className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" aria-hidden /><div><h2 className="font-medium text-ink">{item.title}</h2>{item.body && <p className="mt-1 text-sm text-ink-muted">{item.body}</p>}<p className="mt-2 text-xs text-ink-muted">{new Date(item.createdAt).toLocaleString()}</p></div></Card>)}{!items.length && <p className="py-10 text-center text-sm text-ink-muted">You’re all caught up.</p>}</div></div>;
}
