import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { BarChart3, ChevronDown, ChevronUp, FileQuestion, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
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

interface TemplateQuestion {
  id: string;
  prompt: string;
  type: QuestionType;
  options: string[] | null;
  section: string | null;
}
interface Template { id: string; name: string; questions: TemplateQuestion[] }
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
  const templatesQuery = useQuery("/surveys/templates", () => api.get<{ templates: Template[] }>("/surveys/templates"));
  const eventsQuery = useQuery("/events", () => api.get<{ events: Event[] }>("/events"));
  const templates = templatesQuery.data?.templates ?? [];
  const events = eventsQuery.data?.events ?? [];
  const [name, setName] = useState("");
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [eventId, setEventId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("CCC relationship follow-up");
  const [report, setReport] = useState<Report | null>(null);
  const [saving, setSaving] = useState(false);
  // null = building a new template; an id = editing that existing one.
  const [editingId, setEditingId] = useState<string | null>(null);

  // Default to the first event so the status and action buttons aren't dead on
  // arrival — an unselected dropdown reads as "the questionnaire is missing".
  useEffect(() => {
    setEventId((current) => current || events[0]?.id || "");
  }, [events]);

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
  /** Move a question one slot up or down; questions are stored positionally. */
  function moveQuestion(index: number, delta: number) {
    setDraftQuestions((qs) => {
      const target = index + delta;
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /** Load an existing template into the builder for editing. */
  function editTemplate(template: Template) {
    setEditingId(template.id);
    setName(template.name);
    setDraftQuestions(
      template.questions.map((q) => ({
        prompt: q.prompt,
        type: q.type,
        options: q.options ?? [],
        section: q.section ?? "",
      })),
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setName("");
    setDraftQuestions([emptyQuestion()]);
  }

  async function deleteTemplate(template: Template) {
    if (!confirm(`Delete "${template.name}"? This can't be undone.`)) return;
    try {
      await api.delete(`/surveys/templates/${template.id}`);
      if (editingId === template.id) cancelEdit();
      push("Template deleted.", "success");
      void templatesQuery.refetch();
    } catch (err) {
      // The API refuses to delete a template that's attached to an event.
      push(err instanceof ApiError ? err.message : "Couldn't delete that template.", "error");
    }
  }

  async function saveTemplate(e: FormEvent) {
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
      if (editingId) {
        await api.put(`/surveys/templates/${editingId}`, { name, questions: cleaned });
        push("Template updated. Re-attach it to apply the changes to an event.", "success");
      } else {
        await api.post("/surveys/templates", { name, questions: cleaned });
        push("Questionnaire template created.", "success");
      }
      cancelEdit();
      void templatesQuery.refetch();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Couldn't save — check the questions above.", "error");
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileQuestion className="h-5 w-5 text-accent-ink" aria-hidden />
              <h2 className="font-semibold text-ink">
                {editingId ? "Edit template" : "New reusable template"}
              </h2>
            </div>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                <X className="h-4 w-4" aria-hidden />Cancel edit
              </Button>
            )}
          </div>
          {editingId && (
            <p className="mb-4 rounded-control bg-page p-3 text-xs text-ink-muted">
              Events that already use this template keep the questions they were attached with —
              re-attach the template to an event to apply these edits there.
            </p>
          )}
          <form className="space-y-4" onSubmit={saveTemplate}>
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
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        type="button" variant="ghost" size="sm"
                        disabled={i === 0}
                        onClick={() => moveQuestion(i, -1)}
                        aria-label={`Move question ${i + 1} up`}
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        type="button" variant="ghost" size="sm"
                        disabled={i === draftQuestions.length - 1}
                        onClick={() => moveQuestion(i, 1)}
                        aria-label={`Move question ${i + 1} down`}
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeQuestion(i)} aria-label={`Remove question ${i + 1}`}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={addQuestion}>
                <Plus className="h-4 w-4" aria-hidden />Add question
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create template"}
              </Button>
              {editingId && (
                <Button type="button" variant="secondary" onClick={cancelEdit}>Cancel</Button>
              )}
            </div>
          </form>

          <div className="mt-5 border-t border-hairline pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Existing templates ({templates.length})
            </h3>
            <ul className="mt-2 space-y-1.5">
              {templates.map((template) => (
                <li
                  key={template.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-control p-2.5 ${
                    editingId === template.id ? "bg-page ring-1 ring-ink/15" : "bg-page"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{template.name}</p>
                    <p className="text-xs text-ink-muted">{template.questions.length} questions</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="secondary" size="sm" onClick={() => editTemplate(template)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden />Edit
                    </Button>
                    <Button
                      type="button" variant="ghost" size="sm"
                      onClick={() => deleteTemplate(template)}
                      aria-label={`Delete ${template.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
              {!templates.length && <li className="py-3 text-sm text-ink-muted">No templates yet.</li>}
            </ul>
          </div>
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
