import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageCircle, Send, UserCheck, UserX } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, invalidateQueries } from "@/hooks/useQuery";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";

interface Connection {
  id: string; status: string; requesterId: string; recipientId: string;
  requester: { id: string; name: string; profile: { displayName: string; organization: string | null } | null };
  recipient: { id: string; name: string; profile: { displayName: string; organization: string | null } | null };
}
interface Conversation {
  id: string;
  other: { id: string; name: string; profile: { displayName: string; organization: string | null } | null };
  messages: Array<{ body: string; createdAt: string }>;
}
interface ChatMessage { id: string; senderId: string; body: string; createdAt: string; sender?: { name: string }; }

export function MessagesPage() {
  const { user } = useAuth();
  // The open thread lives in the URL so leaving Messages and coming back — or
  // pressing Back — returns to the same conversation instead of resetting.
  const [params, setParams] = useSearchParams();
  const [body, setBody] = useState("");

  const connectionsQuery = useQuery("/network/connections", () => api.get<{ connections: Connection[] }>("/network/connections"));
  const conversationsQuery = useQuery("/network/conversations", () => api.get<{ conversations: Conversation[] }>("/network/conversations"));
  const connections = connectionsQuery.data?.connections ?? [];
  const conversations = conversationsQuery.data?.conversations ?? [];

  const requested = params.get("thread");
  const selected = conversations.some((c) => c.id === requested) ? requested : conversations[0]?.id ?? null;

  function select(id: string) {
    setParams({ thread: id });
  }

  const messagesKey = selected ? `/network/conversations/${selected}/messages` : null;
  // staleTime 0: the poll and the realtime broadcast below both want a real
  // refresh, while the cached thread still paints instantly on arrival.
  const messagesQuery = useQuery(messagesKey, () => api.get<{ messages: ChatMessage[] }>(messagesKey!), { staleTime: 0 });
  const messages = messagesQuery.data?.messages ?? [];

  const loadMessages = messagesQuery.refetch;

  useEffect(() => {
    if (!selected) return;
    api.post(`/network/conversations/${selected}/read`).catch(() => undefined);
    invalidateQueries("/notifications");
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const refresh = () => void loadMessages();
    const timer = window.setInterval(refresh, 5000);
    const channel = supabase?.channel(`conversation:${selected}`, { config: { private: true } })
      .on("broadcast", { event: "message.created" }, refresh)
      .subscribe();
    return () => {
      window.clearInterval(timer);
      if (channel) supabase?.removeChannel(channel);
    };
  }, [selected, loadMessages]);

  const incoming = useMemo(() => connections.filter((c) => c.status === "PENDING" && c.recipientId === user?.id), [connections, user]);

  async function respond(id: string, action: "ACCEPT" | "DECLINE") {
    await api.patch(`/network/connections/${id}`, { action });
    invalidateQueries("/network/");
    invalidateQueries("/notifications");
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!selected || !body.trim()) return;
    const text = body;
    setBody("");
    await api.post(`/network/conversations/${selected}/messages`, { body: text });
    await loadMessages();
    void conversationsQuery.refetch();
  }

  return (
    <div className="space-y-5">
      <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Private conversations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Messages</h1></header>
      {incoming.length > 0 && <section><h2 className="mb-2 text-sm font-semibold text-ink">Connection requests</h2><div className="flex gap-3 overflow-x-auto pb-2">{incoming.map((connection) => { const person = connection.requester.profile; return <Card key={connection.id} className="min-w-64 p-4"><p className="font-medium text-ink">{person?.displayName ?? connection.requester.name}</p><p className="text-sm text-ink-muted">{person?.organization ?? "CCC Community"}</p><div className="mt-3 flex gap-2"><Button size="sm" onClick={() => respond(connection.id, "ACCEPT")}><UserCheck className="h-4 w-4" />Accept</Button><Button size="sm" variant="secondary" onClick={() => respond(connection.id, "DECLINE")}><UserX className="h-4 w-4" />Decline</Button></div></Card>; })}</div></section>}
      <Card className="grid min-h-[560px] overflow-hidden p-0 md:grid-cols-[280px_1fr]">
        <aside className="border-b border-hairline md:border-b-0 md:border-r">
          <div className="border-b border-hairline p-4 text-sm font-semibold text-ink">Conversations</div>
          <div className="flex overflow-x-auto md:block md:max-h-[520px] md:overflow-y-auto">
            {conversations.map((conversation) => <button key={conversation.id} onClick={() => select(conversation.id)} className={cn("min-w-64 border-r border-hairline p-4 text-left tap-target md:block md:w-full md:min-w-0 md:border-b md:border-r-0", selected === conversation.id ? "bg-ink text-page" : "hover:bg-page")}><p className="truncate font-medium">{conversation.other.profile?.displayName ?? conversation.other.name}</p><p className={cn("mt-1 truncate text-xs", selected === conversation.id ? "text-page/70" : "text-ink-muted")}>{conversation.messages[0]?.body ?? "Start the conversation"}</p></button>)}
          </div>
        </aside>
        <section className="flex min-h-[420px] flex-col">
          {!selected ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-ink-muted"><MessageCircle className="mb-3 h-8 w-8" /><p>Accept a connection to start messaging.</p></div> : <>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">{messages.map((message) => <div key={message.id} className={cn("flex", message.senderId === user?.id ? "justify-end" : "justify-start")}><div className={cn("max-w-[82%] rounded-control px-3 py-2 text-sm", message.senderId === user?.id ? "bg-ink text-page" : "bg-page text-ink")}><p className="whitespace-pre-wrap break-words">{message.body}</p><p className="mt-1 text-[10px] opacity-65">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div></div>)}</div>
            <form onSubmit={send} className="flex gap-2 border-t border-hairline p-3"><Input aria-label="Message" maxLength={4000} placeholder="Write a message…" value={body} onChange={(e) => setBody(e.target.value)} /><Button type="submit" aria-label="Send message" disabled={!body.trim()}><Send className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Send</span></Button></form>
          </>}
        </section>
      </Card>
    </div>
  );
}
