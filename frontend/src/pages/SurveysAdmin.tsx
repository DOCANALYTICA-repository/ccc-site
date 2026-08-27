import { useEffect, useState, type FormEvent } from "react";
import { BarChart3, FileQuestion } from "lucide-react";
import { api, downloadFile } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";

interface Template { id: string; name: string; questions: Array<{ id: string; prompt: string }> }
interface Event { id: string; name: string }
interface Report { completion: { arrived: number; submitted: number; outstanding: number }; questions: Array<{ id: string; prompt: string; yes: number; no: number }> }

export function SurveysAdminPage() {
  const { push } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [name, setName] = useState("");
  const [questions, setQuestions] = useState("");
  const [eventId, setEventId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("CCC relationship follow-up");
  const [report, setReport] = useState<Report | null>(null);
  async function load() { const [t, e] = await Promise.all([api.get<{ templates: Template[] }>("/surveys/templates"), api.get<{ events: Event[] }>("/events")]); setTemplates(t.templates); setEvents(e.events); }
  useEffect(() => { load(); }, []);
  async function createTemplate(e: FormEvent) { e.preventDefault(); await api.post("/surveys/templates", { name, questions: questions.split("\n").map((q) => q.trim()).filter(Boolean) }); setName(""); setQuestions(""); push("Questionnaire template created.", "success"); load(); }
  async function attach(e: FormEvent) { e.preventDefault(); await api.post(`/surveys/events/${eventId}/attach`, { templateId, title }); push("Questionnaire attached to event.", "success"); }
  async function status(value: "OPEN" | "CLOSED") { await api.patch(`/surveys/events/${eventId}/status`, { status: value }); push(value === "OPEN" ? "Questionnaire is now open." : "Questionnaire closed.", "success"); }
  async function viewReport() { setReport(await api.get<Report>(`/surveys/events/${eventId}/report`)); }
  return <div className="space-y-6"><header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Event follow-up</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Questionnaires</h1></header><div className="grid gap-4 lg:grid-cols-2"><Card className="p-5"><div className="mb-4 flex items-center gap-2"><FileQuestion className="h-5 w-5 text-accent-ink" /><h2 className="font-semibold text-ink">New reusable template</h2></div><form className="space-y-3" onSubmit={createTemplate}><div><Label htmlFor="templateName">Template name</Label><Input id="templateName" required value={name} onChange={(e) => setName(e.target.value)} /></div><div><Label htmlFor="questions">One yes/no question per line</Label><Textarea id="questions" rows={8} required value={questions} onChange={(e) => setQuestions(e.target.value)} /></div><Button type="submit">Create template</Button></form></Card><Card className="p-5"><div className="mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-accent-ink" /><h2 className="font-semibold text-ink">Event questionnaire</h2></div><form className="space-y-3" onSubmit={attach}><div><Label>Event</Label><select required className="h-11 w-full rounded-control border bg-surface px-3 text-sm" value={eventId} onChange={(e) => { setEventId(e.target.value); setReport(null); }}><option value="">Select event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></div><div><Label>Template</Label><select required className="h-11 w-full rounded-control border bg-surface px-3 text-sm" value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">Select template</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.questions.length} questions</option>)}</select></div><div><Label>Guest-facing title</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} /></div><Button type="submit">Attach snapshot</Button></form><div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4"><Button disabled={!eventId} onClick={() => status("OPEN")}>Open form</Button><Button disabled={!eventId} variant="secondary" onClick={() => status("CLOSED")}>Close form</Button><Button disabled={!eventId} variant="secondary" onClick={viewReport}>View report</Button><Button disabled={!eventId} variant="secondary" onClick={() => downloadFile(`/surveys/events/${eventId}/export.csv`, "survey-responses.csv")}>Export CSV</Button></div></Card></div>{report && <Card className="p-5"><h2 className="text-lg font-semibold text-ink">Results</h2><p className="mt-1 text-sm text-ink-muted">{report.completion.submitted} of {report.completion.arrived} checked-in guests submitted · {report.completion.outstanding} outstanding</p><div className="mt-5 space-y-3">{report.questions.map((q) => { const total = q.yes + q.no; return <div key={q.id} className="rounded-control bg-page p-4"><p className="font-medium text-ink">{q.prompt}</p><div className="mt-2 flex gap-4 text-sm"><span className="text-status-confirmed-fg">Yes: {q.yes} ({total ? Math.round(q.yes / total * 100) : 0}%)</span><span className="text-ink-muted">No: {q.no} ({total ? Math.round(q.no / total * 100) : 0}%)</span></div></div>; })}</div></Card>}</div>;
}
