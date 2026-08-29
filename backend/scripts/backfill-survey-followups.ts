// One-off backfill: teaches questionnaires that were seeded before follow-up
// gating existed which of their questions are follow-ups. Matches on prompt
// text, so it's safe to re-run and safe against re-ordered question lists —
// a prompt that isn't in the seed list is left exactly as it is.
import { prisma } from "../src/lib/prisma.js";
import { questions } from "./seed-corporate-academia-survey.js";

/** Prompt → prompt of the question it follows up on. */
const parentByPrompt = new Map(
  questions.flatMap((q) => (q.followsUp ? [[q.prompt, questions[q.followsUp - 1]!.prompt] as const] : [])),
);

async function backfill(
  label: string,
  rows: Array<{ id: string; prompt: string; position: number; dependsOnPosition: number | null }>,
  update: (id: string, dependsOnPosition: number) => Promise<unknown>,
) {
  const positionByPrompt = new Map(rows.map((r) => [r.prompt, r.position]));
  let changed = 0;
  for (const row of rows) {
    const parentPrompt = parentByPrompt.get(row.prompt);
    if (!parentPrompt) continue;
    const parentPosition = positionByPrompt.get(parentPrompt);
    if (parentPosition === undefined || parentPosition >= row.position) continue;
    if (row.dependsOnPosition === parentPosition) continue;
    await update(row.id, parentPosition);
    changed += 1;
  }
  console.log(`${label}: linked ${changed} follow-up question${changed === 1 ? "" : "s"}.`);
}

async function main() {
  const templates = await prisma.surveyTemplate.findMany({ include: { questions: true } });
  for (const template of templates) {
    await backfill(`Template "${template.name}"`, template.questions, (id, dependsOnPosition) =>
      prisma.surveyTemplateQuestion.update({ where: { id }, data: { dependsOnPosition } }));
  }
  // Attached surveys hold their own snapshot of the questions, so they need
  // the same treatment — otherwise a live form keeps asking everything.
  const surveys = await prisma.eventSurvey.findMany({ include: { questions: true } });
  for (const survey of surveys) {
    await backfill(`Survey "${survey.title}"`, survey.questions, (id, dependsOnPosition) =>
      prisma.eventSurveyQuestion.update({ where: { id }, data: { dependsOnPosition } }));
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
