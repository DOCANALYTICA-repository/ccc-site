import { ChevronLeft, ChevronRight, Mail, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatAnswer, groupBySection, type QuestionReport, type Respondent } from "@/lib/surveyAnalytics";

/** Full read of one person's submission: who they are, plus every question
 * with their own answer, grouped by the questionnaire's own sections. */
export function RespondentDetail({
  respondent,
  questions,
  onClose,
  onPrev,
  onNext,
  position,
}: {
  respondent: Respondent;
  questions: QuestionReport[];
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  position: string;
}) {
  const sections = groupBySection(questions);
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-ink">{respondent.name}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {[respondent.designation, respondent.organization].filter(Boolean).join(" · ") || "No organisation recorded"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Tag>{respondent.industry}</Tag>
            <Tag>{respondent.role}</Tag>
            {respondent.wantsContact && <Tag accent>Wants follow-up</Tag>}
            {respondent.preferredContactMode && <Tag>Prefers {respondent.preferredContactMode}</Tag>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs text-ink-muted">{position}</span>
          <Button size="sm" variant="secondary" disabled={!onPrev} onClick={onPrev} aria-label="Previous respondent">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button size="sm" variant="secondary" disabled={!onNext} onClick={onNext} aria-label="Next respondent">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close respondent detail">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="Readiness" value={`${respondent.readiness}%`} />
        <Metric label="Overall interest" value={respondent.interest ? `${respondent.interest} / 5` : "—"} />
        <Metric label="Submitted" value={new Date(respondent.submittedAt).toLocaleDateString()} />
        <div className="rounded-control bg-page p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Contact</p>
          <div className="mt-1 space-y-0.5 text-sm text-ink">
            {respondent.email && (
              <a className="flex items-center gap-1.5 truncate hover:underline" href={`mailto:${respondent.email}`}>
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />{respondent.email}
              </a>
            )}
            {respondent.phone && (
              <a className="flex items-center gap-1.5 truncate hover:underline" href={`tel:${respondent.phone}`}>
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />{respondent.phone}
              </a>
            )}
            {!respondent.email && !respondent.phone && <span className="text-ink-muted">Not recorded</span>}
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {sections.map(({ section, items }) => (
          <section key={section}>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink">{section}</h3>
            <dl className="mt-2 space-y-2">
              {items.map((question) => {
                const value = respondent.answers[question.id];
                return (
                  <div key={question.id} className="rounded-control bg-page p-3">
                    <dt className="text-sm text-ink-muted">{question.prompt}</dt>
                    <dd className="mt-1.5">
                      {Array.isArray(value) && value.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {value.map((option) => <Tag key={option} accent>{option}</Tag>)}
                        </div>
                      ) : (
                        <span className={`text-sm font-medium ${value === null ? "text-ink-muted" : "text-ink"}`}>
                          {formatAnswer(value)}
                        </span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-page p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

// The brand orange is a text-only colour (see index.css) — a filled orange
// chip would fail contrast, so an emphasised tag uses the ink fill instead.
function Tag({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${accent ? "bg-ink text-page" : "bg-page text-ink"}`}>
      {children}
    </span>
  );
}
