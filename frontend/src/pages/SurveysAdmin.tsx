import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { BarChart3, FileQuestion, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Donut } from "@/components/ui/BarChart";

type QuestionType = "YES_NO" | "SINGLE_SELECT" | "MULTI_SELECT" | "TEXT" | "SCALE_1_5";

const TYPE_LABELS: Record<QuestionType, string> = {
  YES_NO: "Yes / No",
  SINGLE_SELECT: "Single choice",
  MULTI_SELECT: "Multiple choice",
  TEXT: "Free text",
  SCALE_1_5: "1–5 rating",
};

interface DraftQuestion {
  prompt: string;
  type: QuestionType;
  options: string[];
  section: string;
}

interface Template { id: string; name: string; questions: Array<{ id: string; prompt: string; type: QuestionType }> }
interface Event { id: string; name: string }

// Only the bits this screen needs — the full per-question breakdown is the
// analytics screen's job, so this page just reads status and completion.
interface Report {
  survey: { id: string; title: string; status: "DRAFT" | "OPEN" | "CLOSED" };
  completion: { arrived: number; submitted: number; outstanding: number };
}

function emptyQuestion(): DraftQuestion {
  return { prompt: "", type: "YES_NO", options: [], section: "" };
}

export function SurveysAdminPage() {
  const { push } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [name, setName] = useState("");
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [eventId, setEventId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("CCC relationship follow-up");
  const [report, setReport] = useState<Report | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [t, e] = await Promise.all([
      api.get<{ templates: Template[] }>("/surveys/templates"),
      api.get<{ events: Event[] }>("/events"),
    ]);
    setTemplates(t.templates);
    setEvents(e.events);
    setEventId((current) => current || e.events[0]?.id || "");
  }
  useEffect(() => { load(); }, []);

  // Auto-load the report whenever the selected event has an attached
  // survey, so "not seeing anything" isn't the default first impression —
  // the admin doesn't have to know to click "View report" first.
  useEffect(() => {
    if (!eventId) { setReport(null); return; }
    api.get<Report>(`/surveys/events/${eventId}/report`).then(setReport).catch(() => setReport(null));
  }, [eventId]);

  function updateQuestion(index: number, patch: Partial<DraftQuestion>) {
    setDraftQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }
  function addQuestion() { setDraftQuestions((qs) => [...qs, emptyQuestion()]); }
  function removeQuestion(index: number) { setDraftQuestions((qs) => qs.filter((_, i) => i !== index)); }
  function updateOption(qIndex: number, oIndex: number, value: string) {
    setDraftQuestions((qs) => qs.map((q, i) => i === qIndex ? { ...q, options: q.options.map((o, j) => j === oIndex ? value : o) } : q));
  }
  function addOption(qIndex: number) {
    setDraftQuestions((qs) => qs.map((q, i) => i === qIndex ? { ...q, options: [...q.options, ""] } : q));
  }
  function removeOption(qIndex: number, oIndex: number) {
    setDraftQuestions((qs) => qs.map((q, i) => i === qIndex ? { ...q, options: q.options.filter((_, j) => j !== oIndex) } : q));
  }

  async function createTemplate(e: FormEvent) {
    e.preventDefault();
    const needsOptions = (t: QuestionType) => t === "SINGLE_SELECT" || t === "MULTI_SELECT";
    const cleaned = draftQuestions
      .filter((q) => q.prompt.trim())
      .map((q) => ({
        prompt: q.prompt.trim(),
        type: q.type,
        section: q.section.trim() || null,
        options: needsOptions(q.type) ? q.options.map((o) => o.trim()).filter(Boolean) : null,
      }));
    if (!cleaned.length) { push("Add at least one question.", "error"); return; }
    if (cleaned.some((q) => needsOptions(q.type) && (q.options?.length ?? 0) < 2)) {
      push("Choice questions need at least two options.", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/surveys/templates", { name, questions: cleaned });
      setName("");
      setDraftQuestions([emptyQuestion()]);
      push("Questionnaire template created.", "success");
      load();
    } catch {
      push("Couldn't create template — check the questions above.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function viewReport() {
    try {
      setReport(await api.get<Report>(`/surveys/events/${eventId}/report`));
    } catch {
      setReport(null);
    }
  }
  async function attach(e: FormEvent) {
    e.preventDefault();
    await api.post(`/surveys/events/${eventId}/attach`, { templateId, title });
    push("Questionnaire attached to event.", "success");
    viewReport();
  }
  async function status(value: "OPEN" | "CLOSED") {
    await api.patch(`/surveys/events/${eventId}/status`, { status: value });
    push(value === "OPEN" ? "Questionnaire is now open." : "Questionnaire closed.", "success");
    viewReport();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-ink">Event follow-up</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Questionnaires</h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <FileQuestion className="h-5 w-5 text-accent-ink" aria-hidden />
            <h2 className="font-semibold text-ink">New reusable template</h2>
          </div>
          <form className="space-y-4" onSubmit={createTemplate}>
            <div>
              <Label htmlFor="templateName">Template name</Label>
              <Input id="templateName" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-3">
              {draftQuestions.map((q, i) => (
                <div key={i} className="rounded-control border border-hairline bg-page p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-3 shrink-0 text-xs font-semibold text-ink-muted">{i + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Question prompt"
                        value={q.prompt}
                        onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <select
                          className="h-10 flex-1 rounded-control border border-hairline bg-surface px-2 text-sm"
                          value={q.type}
                          onChange={(e) => updateQuestion(i, { type: e.target.value as QuestionType })}
                        >
                          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
                            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                          ))}
                        </select>
                        <Input
                          className="h-10 flex-1"
                          placeholder="Section (optional)"
                          value={q.section}
                          onChange={(e) => updateQuestion(i, { section: e.target.value })}
                        />
                      </div>
                      {(q.type === "SINGLE_SELECT" || q.type === "MULTI_SELECT") && (
                        <div className="space-y-1.5 pl-1">
                          {q.options.map((option, oi) => (
                            <div key={oi} className="flex gap-2">
                              <Input
                                className="h-9 flex-1"
                                placeholder={`Option ${oi + 1}`}
                                value={option}
                                onChange={(e) => updateOption(i, oi, e.target.value)}
                              />
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeOption(i, oi)} aria-label="Remove option">
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
                            </div>
                          ))}
                          <Button type="button" variant="secondary" size="sm" onClick={() => addOption(i)}>
                            <Plus className="h-4 w-4" aria-hidden />Add option
                          </Button>
                        </div>
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeQuestion(i)} aria-label="Remove question">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={addQuestion}>
                <Plus className="h-4 w-4" aria-hidden />Add question
              </Button>
            </div>

            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create template"}</Button>
          </form>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent-ink" aria-hidden />
            <h2 className="font-semibold text-ink">Event questionnaire</h2>
          </div>
          <form className="space-y-3" onSubmit={attach}>
            <div>
              <Label>Event</Label>
              <select
                required
                className="h-11 w-full rounded-control border bg-surface px-3 text-sm"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              >
                <option value="">Select event</option>
                {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Template</Label>
              <select
                required
                className="h-11 w-full rounded-control border bg-surface px-3 text-sm"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">Select template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.questions.length} questions</option>)}
              </select>
            </div>
            <div>
              <Label>Guest-facing title</Label>
              <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <Button type="submit">Attach snapshot</Button>
          </form>
          <div className="mt-4 border-t border-hairline pt-4">
            {eventId && (
              <p className="mb-3 text-sm text-ink-muted">
                Status:{" "}
                <span className="font-semibold text-ink">
                  {report ? report.survey.status : "No questionnaire attached yet"}
                </span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={!eventId || !report} onClick={() => status("OPEN")}>Open form</Button>
              <Button disabled={!eventId || !report} variant="secondary" onClick={() => status("CLOSED")}>Close form</Button>
              <Button disabled={!eventId || !report} variant="secondary" onClick={viewReport}>Refresh status</Button>
            </div>
          </div>
        </Card>
      </div>

      {report && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-4">
            <Donut
              value={report.completion.submitted}
              total={report.completion.arrived}
              label={`${report.completion.submitted} of ${report.completion.arrived} checked-in guests submitted`}
            />
            <div>
              <h2 className="text-lg font-semibold text-ink">Results live in Analytics</h2>
              <p className="mt-1 max-w-md text-sm text-ink-muted">
                Charts by industry and role, follow-up leads, and every individual response are on the analytics screen.
              </p>
            </div>
          </div>
          <Link to={`/survey-analytics?event=${eventId}`}>
            <Button>
              <BarChart3 className="h-4 w-4" aria-hidden />View analytics
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
