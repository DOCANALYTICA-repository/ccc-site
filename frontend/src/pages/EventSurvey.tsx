import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Input";

type QuestionType = "YES_NO" | "SINGLE_SELECT" | "MULTI_SELECT" | "TEXT" | "SCALE_1_5";

interface Question {
  id: string;
  prompt: string;
  type: QuestionType;
  options: string[] | null;
  section: string | null;
}

type AnswerValue = boolean | string | string[] | number;

interface SurveyData {
  survey: { title: string; questions: Question[] };
  response: { answers: Array<{ questionId: string; value: boolean | null; textValue: string | null; scaleValue: number | null; selectedOptions: string[] | null }> } | null;
}

function toAnswerValue(a: { value: boolean | null; textValue: string | null; scaleValue: number | null; selectedOptions: string[] | null }): AnswerValue | undefined {
  if (a.value !== null) return a.value;
  if (a.scaleValue !== null) return a.scaleValue;
  if (a.textValue !== null) return a.textValue;
  if (a.selectedOptions) return a.selectedOptions;
  return undefined;
}

export function EventSurveyPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<SurveyData | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<SurveyData>(`/surveys/mine/${id}`).then((r) => {
      setData(r);
      const initial: Record<string, AnswerValue> = {};
      for (const a of r.response?.answers ?? []) {
        const value = toAnswerValue(a);
        if (value !== undefined) initial[a.questionId] = value;
      }
      setAnswers(initial);
    });
  }, [id]);

  const sections = useMemo(() => {
    if (!data) return [];
    const order: string[] = [];
    const map = new Map<string, Question[]>();
    for (const q of data.survey.questions) {
      const key = q.section ?? "";
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(q);
    }
    return order.map((key) => ({ title: key, questions: map.get(key)! }));
  }, [data]);

  const answeredCount = data ? data.survey.questions.filter((q) => isAnswered(q, answers[q.id])).length : 0;
  const total = data?.survey.questions.length ?? 0;

  function setAnswer(questionId: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function toggleMulti(questionId: string, option: string) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
      return { ...prev, [questionId]: next };
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!data || answeredCount !== total) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/surveys/mine/${id}`, {
        answers: data.survey.questions.map((q) => ({ questionId: q.id, value: answers[q.id] })),
      });
      navigate("/");
    } catch {
      setError("Couldn't submit — check your answers and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <p className="text-sm text-ink-muted">Loading questionnaire…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-24">
      <header>
        <ClipboardCheck className="h-8 w-8 text-accent-ink" aria-hidden />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">{data.survey.title}</h1>
        <p className="mt-2 text-sm text-ink-muted">Answer every question. You can update your answers until the form closes.</p>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }} />
          </div>
          <span className="shrink-0 text-xs font-medium text-ink-muted">{answeredCount} / {total}</span>
        </div>
      </header>

      <form className="space-y-8" onSubmit={submit}>
        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            {section.title && (
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink">{section.title}</h2>
            )}
            <div className="space-y-3">
              {section.questions.map((question) => {
                const index = data.survey.questions.indexOf(question);
                return (
                  <Card key={question.id} className="p-5">
                    <fieldset>
                      <legend className="font-medium text-ink">
                        <span className="mr-2 text-accent-ink">{index + 1}.</span>
                        {question.prompt}
                      </legend>
                      <div className="mt-4">
                        <QuestionInput
                          question={question}
                          value={answers[question.id]}
                          onChange={(v) => setAnswer(question.id, v)}
                          onToggleOption={(option) => toggleMulti(question.id, option)}
                        />
                      </div>
                    </fieldset>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}

        {error && <p className="text-sm text-[#c10801]">{error}</p>}
        <div className="fixed inset-x-0 bottom-0 border-t border-hairline bg-page/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <Button className="w-full" type="submit" disabled={saving || answeredCount !== total}>
              {saving ? "Saving…" : answeredCount === total ? "Submit answers" : `Answer all questions to submit (${answeredCount}/${total})`}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function isAnswered(question: Question, value: AnswerValue | undefined) {
  if (value === undefined) return false;
  if (question.type === "MULTI_SELECT") return Array.isArray(value) && value.length > 0;
  if (question.type === "TEXT") return typeof value === "string" && value.trim().length > 0;
  return true;
}

function QuestionInput({
  question,
  value,
  onChange,
  onToggleOption,
}: {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  onToggleOption: (option: string) => void;
}) {
  if (question.type === "YES_NO") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((v) => (
          <PillOption key={String(v)} active={value === v} onClick={() => onChange(v)}>
            {v ? "Yes" : "No"}
          </PillOption>
        ))}
      </div>
    );
  }
  if (question.type === "SCALE_1_5") {
    return (
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <PillOption key={n} active={value === n} onClick={() => onChange(n)}>
            {n}
          </PillOption>
        ))}
      </div>
    );
  }
  if (question.type === "SINGLE_SELECT") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(question.options ?? []).map((option) => (
          <PillOption key={option} active={value === option} onClick={() => onChange(option)}>
            {option}
          </PillOption>
        ))}
      </div>
    );
  }
  if (question.type === "MULTI_SELECT") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(question.options ?? []).map((option) => (
          <PillOption key={option} active={selected.includes(option)} onClick={() => onToggleOption(option)}>
            {option}
          </PillOption>
        ))}
      </div>
    );
  }
  // TEXT
  return (
    <Textarea
      rows={3}
      placeholder="Type your answer…"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function PillOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 cursor-pointer items-center justify-center rounded-control border px-3 text-center text-sm font-semibold leading-tight transition-colors ${
        active ? "border-ink bg-ink text-page" : "border-hairline bg-surface text-ink hover:bg-page"
      }`}
    >
      {children}
    </button>
  );
}
