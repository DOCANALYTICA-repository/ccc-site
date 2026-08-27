import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireInternal } from "../middleware/auth.js";

export const surveysRouter = Router();
surveysRouter.use(requireAuth);

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
    answers: z.array(z.object({ questionId: z.string().uuid(), value: z.boolean() })).min(1),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Every question needs a yes or no answer." });
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
  const expected = new Set(survey.questions.map((q) => q.id));
  if (parsed.data.answers.length !== expected.size || parsed.data.answers.some((a) => !expected.has(a.questionId))) {
    return res.status(400).json({ error: "Every current question must be answered exactly once." });
  }
  const response = await prisma.$transaction(async (tx) => {
    const value = await tx.surveyResponse.upsert({
      where: { invitationId: invitation.id },
      create: { surveyId: survey.id, invitationId: invitation.id, userId: req.user!.id },
      update: { submittedAt: new Date() },
    });
    await tx.surveyAnswer.deleteMany({ where: { responseId: value.id } });
    await tx.surveyAnswer.createMany({
      data: parsed.data.answers.map((a) => ({ responseId: value.id, questionId: a.questionId, value: a.value })),
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
    questions: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid template." });
  const template = await prisma.surveyTemplate.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      questions: { create: parsed.data.questions.map((prompt, position) => ({ prompt, position })) },
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
      questions: { create: template.questions.map((q) => ({ prompt: q.prompt, position: q.position })) },
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
          entityType: "EventSurvey",
          entityId: updated.id,
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
    questions: survey.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      yes: q.answers.filter((a) => a.value).length,
      no: q.answers.filter((a) => !a.value).length,
    })),
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
  const rows = [
    ["Guest", "Organisation", "Submitted at", ...survey.questions.map((q) => q.prompt)],
    ...survey.responses.map((response) => {
      const byQuestion = new Map(response.answers.map((answer) => [answer.questionId, answer.value]));
      return [response.invitation.contact.fullName, response.invitation.contact.organization ?? "", response.submittedAt.toISOString(), ...survey.questions.map((question) => byQuestion.get(question.id) ? "Yes" : "No")];
    }),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="survey-responses.csv"');
  res.send(`\uFEFF${rows.map((row) => row.map(quote).join(",")).join("\n")}`);
});
