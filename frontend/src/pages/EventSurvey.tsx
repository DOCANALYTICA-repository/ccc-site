import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface SurveyData {
  survey: { title: string; questions: Array<{ id: string; prompt: string }> };
  response: { answers: Array<{ questionId: string; value: boolean }> } | null;
}

export function EventSurveyPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<SurveyData | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<SurveyData>(`/surveys/mine/${id}`).then((r) => { setData(r); setAnswers(Object.fromEntries(r.response?.answers.map((a) => [a.questionId, a.value]) ?? [])); }); }, [id]);
  async function submit(e: FormEvent) { e.preventDefault(); if (!data || Object.keys(answers).length !== data.survey.questions.length) return; setSaving(true); await api.put(`/surveys/mine/${id}`, { answers: data.survey.questions.map((q) => ({ questionId: q.id, value: answers[q.id] })) }); setSaving(false); navigate("/"); }
  if (!data) return <p className="text-sm text-ink-muted">Loading questionnaire…</p>;
  return <div className="mx-auto max-w-2xl space-y-5"><header><ClipboardCheck className="h-8 w-8 text-accent-ink" /><h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">{data.survey.title}</h1><p className="mt-2 text-sm text-ink-muted">Answer every question. You can update your answers until the form closes.</p></header><form className="space-y-3" onSubmit={submit}>{data.survey.questions.map((question, index) => <Card key={question.id} className="p-5"><fieldset><legend className="font-medium text-ink"><span className="mr-2 text-accent-ink">{index + 1}.</span>{question.prompt}</legend><div className="mt-4 grid grid-cols-2 gap-2">{[true, false].map((value) => <label key={String(value)} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-control border px-4 text-sm font-semibold ${answers[question.id] === value ? "border-ink bg-ink text-page" : "border-hairline bg-surface text-ink hover:bg-page"}`}><input className="sr-only" type="radio" name={question.id} checked={answers[question.id] === value} onChange={() => setAnswers((a) => ({ ...a, [question.id]: value }))} />{value ? "Yes" : "No"}</label>)}</div></fieldset></Card>)}<Button className="w-full" type="submit" disabled={saving || Object.keys(answers).length !== data.survey.questions.length}>{saving ? "Saving…" : "Submit answers"}</Button></form></div>;
}
