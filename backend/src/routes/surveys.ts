import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireInternal } from "../middleware/auth.js";

export const surveysRouter = Router();
surveysRouter.use(requireAuth);

const questionTypeSchema = z.enum(["YES_NO", "SINGLE_SELECT", "MULTI_SELECT", "TEXT", "SCALE_1_5"]);

const templateQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  type: questionTypeSchema.default("YES_NO"),
  options: z.array(z.string().trim().min(1).max(200)).max(30).nullish(),
  section: z.string().trim().max(200).nullish(),
}).refine(
  (q) => (q.type === "SINGLE_SELECT" || q.type === "MULTI_SELECT" ? (q.options?.length ?? 0) >= 2 : true),
  { message: "Select-type questions need at least two options.", path: ["options"] },
);

/** Validates one answer against its question's type, returning the columns
 * to persist on SurveyAnswer (only the field matching the type is set). */
function validateAnswer(
  question: { id: string; type: string; options: unknown },
  raw: unknown,
): { ok: true; data: { value: boolean | null; textValue: string | null; scaleValue: number | null; selectedOptions: string[] | null } } | { ok: false; error: string } {
  const options = Array.isArray(question.options) ? (question.options as string[]) : [];
  switch (question.type) {
    case "YES_NO": {
      const parsed = z.boolean().safeParse(raw);
      if (!parsed.success) return { ok: false, error: "Expected a yes/no answer." };
      return { ok: true, data: { value: parsed.data, textValue: null, scaleValue: null, selectedOptions: null } };
    }
    case "SINGLE_SELECT": {
      const parsed = z.string().min(1).safeParse(raw);
      if (!parsed.success || !options.includes(parsed.data)) return { ok: false, error: "Invalid option selected." };
      return { ok: true, data: { value: null, textValue: null, scaleValue: null, selectedOptions: [parsed.data] } };
    }
    case "MULTI_SELECT": {
      const parsed = z.array(z.string().min(1)).min(1).safeParse(raw);
      if (!parsed.success || parsed.data.some((v) => !options.includes(v))) return { ok: false, error: "Invalid options selected." };
      return { ok: true, data: { value: null, textValue: null, scaleValue: null, selectedOptions: parsed.data } };
    }
    case "TEXT": {
      const parsed = z.string().trim().min(1).max(4000).safeParse(raw);
      if (!parsed.success) return { ok: false, error: "This question needs a text answer." };
      return { ok: true, data: { value: null, textValue: parsed.data, scaleValue: null, selectedOptions: null } };
    }
    case "SCALE_1_5": {
      const parsed = z.number().int().min(1).max(5).safeParse(raw);
      if (!parsed.success) return { ok: false, error: "Expected a rating from 1 to 5." };
      return { ok: true, data: { value: null, textValue: null, scaleValue: parsed.data, selectedOptions: null } };
    }
    default:
      return { ok: false, error: "Unknown question type." };
  }
}

surveysRouter.get("/mine/:eventId", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.contactId) return res.status(403).json({ error: "No guest record is linked." });
  const invitation = await prisma.eventInvitation.findUnique({
    where: { eventId_contactId: { eventId: req.params.eventId, contactId: user.contactId } },
    include: {
      surveyResponse: { include: { answers: true } },
      event: {
        include: {
          survey: { include: { questions: { orderBy: { position: "asc" } } } },
        },
      },
    },
  });
  if (!invitation || invitation.status !== "ARRIVED_IN_CAMPUS" || invitation.event.survey?.status !== "OPEN") {
    return res.status(404).json({ error: "No open questionnaire is available." });
  }
  res.json({ survey: invitation.event.survey, invitationId: invitation.id, response: invitation.surveyResponse });
});

surveysRouter.put("/mine/:eventId", async (req, res) => {
  const parsed = z.object({
    answers: z.array(z.object({ questionId: z.string().uuid(), value: z.unknown() })).min(1),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Every question needs an answer." });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.contactId) return res.status(403).json({ error: "No guest record is linked." });
  const invitation = await prisma.eventInvitation.findUnique({
    where: { eventId_contactId: { eventId: req.params.eventId, contactId: user.contactId } },
    include: { event: { include: { survey: { include: { questions: true } } } } },
  });
  const survey = invitation?.event.survey;
  if (!invitation || invitation.status !== "ARRIVED_IN_CAMPUS" || survey?.status !== "OPEN") {
    return res.status(403).json({ error: "This questionnaire is not available." });
  }
  const byId = new Map(survey.questions.map((q) => [q.id, q]));
  if (parsed.data.answers.length !== byId.size || parsed.data.answers.some((a) => !byId.has(a.questionId))) {
    return res.status(400).json({ error: "Every current question must be answered exactly once." });
  }
  const rows: Array<{ questionId: string; value: boolean | null; textValue: string | null; scaleValue: number | null; selectedOptions: string[] | null }> = [];
  for (const answer of parsed.data.answers) {
    const question = byId.get(answer.questionId)!;
    const result = validateAnswer(question, answer.value);
    if (!result.ok) return res.status(400).json({ error: `${question.prompt}: ${result.error}` });
    rows.push({ questionId: answer.questionId, ...result.data });
  }
  const response = await prisma.$transaction(async (tx) => {
    const value = await tx.surveyResponse.upsert({
      where: { invitationId: invitation.id },
      create: { surveyId: survey.id, invitationId: invitation.id, userId: req.user!.id },
      update: { submittedAt: new Date() },
    });
    await tx.surveyAnswer.deleteMany({ where: { responseId: value.id } });
    await tx.surveyAnswer.createMany({
      data: rows.map((r) => ({
        responseId: value.id,
        questionId: r.questionId,
        value: r.value,
        textValue: r.textValue,
        scaleValue: r.scaleValue,
        selectedOptions: r.selectedOptions ?? undefined,
      })),
    });
    return value;
  });
  res.json({ response });
});

surveysRouter.use(requireInternal);

surveysRouter.get("/templates", async (_req, res) => {
  const templates = await prisma.surveyTemplate.findMany({
    include: { questions: { orderBy: { position: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ templates });
});

surveysRouter.post("/templates", async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullish(),
    questions: z.array(templateQuestionSchema).min(1).max(100),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid template." });
  const template = await prisma.surveyTemplate.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      questions: {
        create: parsed.data.questions.map((q, position) => ({
          prompt: q.prompt,
          type: q.type,
          options: q.options ?? undefined,
          section: q.section ?? undefined,
          position,
        })),
      },
    },
    include: { questions: true },
  });
  res.status(201).json({ template });
});

surveysRouter.post("/events/:eventId/attach", async (req, res) => {
  const parsed = z.object({ templateId: z.string().uuid(), title: z.string().trim().min(1).max(240) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid survey." });
  const template = await prisma.surveyTemplate.findUnique({
    where: { id: parsed.data.templateId },
    include: { questions: { orderBy: { position: "asc" } } },
  });
  if (!template) return res.status(404).json({ error: "Template not found." });
  const survey = await prisma.eventSurvey.create({
    data: {
      eventId: req.params.eventId,
      templateId: template.id,
      title: parsed.data.title,
      questions: {
        create: template.questions.map((q) => ({
          prompt: q.prompt,
          type: q.type,
          options: q.options ?? undefined,
          section: q.section ?? undefined,
          position: q.position,
        })),
      },
    },
    include: { questions: true },
  });
  res.status(201).json({ survey });
});

surveysRouter.patch("/events/:eventId/status", async (req, res) => {
  const parsed = z.object({ status: z.enum(["OPEN", "CLOSED"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid status." });
  const existing = await prisma.eventSurvey.findUnique({ where: { eventId: req.params.eventId } });
  if (!existing) return res.status(404).json({ error: "Survey not found." });
  const survey = await prisma.$transaction(async (tx) => {
    const updated = await tx.eventSurvey.update({
      where: { id: existing.id },
      data: parsed.data.status === "OPEN"
        ? { status: "OPEN", openedAt: new Date(), closedAt: null }
        : { status: "CLOSED", closedAt: new Date() },
    });
    if (parsed.data.status === "OPEN") {
      const guests = await tx.eventInvitation.findMany({
        where: { eventId: req.params.eventId, status: "ARRIVED_IN_CAMPUS", contact: { account: { isNot: null } } },
        include: { contact: { include: { account: true } } },
      });
      if (guests.length) await tx.notification.createMany({
        data: guests.flatMap((inv) => inv.contact.account ? [{
          userId: inv.contact.account.id,
          type: "SURVEY_OPENED" as const,
          title: updated.title,
          body: "The event questionnaire is ready.",
          entityType: "Event",
          entityId: req.params.eventId,
        }] : []),
      });
    }
    return updated;
  });
  res.json({ survey });
});

surveysRouter.get("/events/:eventId/report", async (req, res) => {
  const survey = await prisma.eventSurvey.findUnique({
    where: { eventId: req.params.eventId },
    include: {
      questions: {
        orderBy: { position: "asc" },
        include: { answers: true },
      },
      responses: {
        include: {
          invitation: { include: { contact: { select: { fullName: true, organization: true } } } },
          answers: true,
        },
      },
    },
  });
  if (!survey) return res.status(404).json({ error: "Survey not found." });
  const arrived = await prisma.eventInvitation.count({
    where: { eventId: req.params.eventId, status: "ARRIVED_IN_CAMPUS" },
  });
  res.json({
    survey,
    completion: { arrived, submitted: survey.responses.length, outstanding: Math.max(0, arrived - survey.responses.length) },
    questions: survey.questions.map((q) => {
      const base = { id: q.id, prompt: q.prompt, type: q.type, section: q.section, options: q.options as string[] | null };
      if (q.type === "YES_NO") {
        return { ...base, yes: q.answers.filter((a) => a.value === true).length, no: q.answers.filter((a) => a.value === false).length };
      }
      if (q.type === "SINGLE_SELECT" || q.type === "MULTI_SELECT") {
        const tally = new Map<string, number>();
        for (const option of (q.options as string[] | null) ?? []) tally.set(option, 0);
        for (const answer of q.answers) {
          for (const selected of (answer.selectedOptions as string[] | null) ?? []) {
            tally.set(selected, (tally.get(selected) ?? 0) + 1);
          }
        }
        return { ...base, counts: Array.from(tally, ([option, count]) => ({ option, count })), responded: q.answers.length };
      }
      if (q.type === "SCALE_1_5") {
        const values = q.answers.map((a) => a.scaleValue).filter((v): v is number => v != null);
        const distribution = [1, 2, 3, 4, 5].map((n) => ({ value: n, count: values.filter((v) => v === n).length }));
        const average = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
        return { ...base, distribution, average, responded: values.length };
      }
      // TEXT
      return {
        ...base,
        responses: q.answers.filter((a) => a.textValue).map((a) => a.textValue as string),
        responded: q.answers.filter((a) => a.textValue).length,
      };
    }),
  });
});

surveysRouter.get("/events/:eventId/export.csv", async (req, res) => {
  const survey = await prisma.eventSurvey.findUnique({
    where: { eventId: req.params.eventId },
    include: {
      questions: { orderBy: { position: "asc" } },
      responses: {
        include: {
          invitation: { include: { contact: { select: { fullName: true, organization: true } } } },
          answers: true,
        },
        orderBy: { submittedAt: "asc" },
      },
    },
  });
  if (!survey) return res.status(404).json({ error: "Survey not found." });
  const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const formatAnswer = (answer: { value: boolean | null; textValue: string | null; scaleValue: number | null; selectedOptions: unknown } | undefined) => {
    if (!answer) return "";
    if (answer.value !== null) return answer.value ? "Yes" : "No";
    if (answer.scaleValue !== null) return String(answer.scaleValue);
    if (answer.textValue !== null) return answer.textValue;
    if (Array.isArray(answer.selectedOptions)) return (answer.selectedOptions as string[]).join("; ");
    return "";
  };
  const rows = [
    ["Guest", "Organisation", "Submitted at", ...survey.questions.map((q) => q.prompt)],
    ...survey.responses.map((response) => {
      const byQuestion = new Map(response.answers.map((answer) => [answer.questionId, answer]));
      return [
        response.invitation.contact.fullName,
        response.invitation.contact.organization ?? "",
        response.submittedAt.toISOString(),
        ...survey.questions.map((question) => formatAnswer(byQuestion.get(question.id))),
      ];
    }),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="survey-responses.csv"');
  res.send(`﻿${rows.map((row) => row.map(quote).join(",")).join("\n")}`);
});
