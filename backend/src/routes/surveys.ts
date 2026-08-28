import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireInternal } from "../middleware/auth.js";
import {
  classifyIndustry,
  classifyOptionSentiment,
  classifyRole,
  readinessScore,
  wordFrequencies,
  type NormalizedAnswer,
} from "../lib/surveySegments.js";

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

/**
 * The full analytics payload for one event's questionnaire: every respondent
 * with their answers and derived segments, per-question aggregates broken down
 * by industry and role, and cross-question insight blocks.
 *
 * Everything ships in one response so the admin UI can filter, sort and search
 * client-side without a round-trip per interaction. That's viable because the
 * dataset is bounded by the guest list — hundreds of respondents, not millions.
 */
surveysRouter.get("/events/:eventId/analytics", async (req, res) => {
  const survey = await prisma.eventSurvey.findUnique({
    where: { eventId: req.params.eventId },
    include: {
      questions: { orderBy: { position: "asc" } },
      responses: {
        orderBy: { submittedAt: "asc" },
        include: {
          answers: true,
          invitation: {
            include: {
              contact: {
                select: {
                  id: true, fullName: true, organization: true, designation: true,
                  email: true, phone: true, profileUrl: true,
                  tags: { include: { tag: { select: { name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!survey) return res.status(404).json({ error: "Survey not found." });
  const arrived = await prisma.eventInvitation.count({
    where: { eventId: req.params.eventId, status: "ARRIVED_IN_CAMPUS" },
  });

  const questions = survey.questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    type: q.type as string,
    section: q.section,
    options: (q.options as string[] | null) ?? null,
    position: q.position,
  }));

  const normalize = (a: { value: boolean | null; textValue: string | null; scaleValue: number | null; selectedOptions: unknown }): NormalizedAnswer => ({
    value: a.value,
    textValue: a.textValue,
    scaleValue: a.scaleValue,
    selectedOptions: Array.isArray(a.selectedOptions) ? (a.selectedOptions as string[]) : null,
  });

  // The single 1–5 question is the questionnaire's headline interest metric,
  // and the "would you like us to contact you" question drives the leads list.
  const interestQuestion = questions.find((q) => q.type === "SCALE_1_5");
  const contactQuestion = questions.find((q) => /like our team to contact you/i.test(q.prompt));
  const contactModeQuestion = questions.find((q) => /preferred mode of contact/i.test(q.prompt));

  const respondents = survey.responses.map((response) => {
    const contact = response.invitation.contact;
    const tags = contact.tags.map((t) => t.tag.name);
    const answerMap = new Map(response.answers.map((a) => [a.questionId, normalize(a)]));
    const answers: Record<string, boolean | string | string[] | number | null> = {};
    for (const question of questions) {
      const answer = answerMap.get(question.id);
      if (!answer) { answers[question.id] = null; continue; }
      if (answer.value !== null) answers[question.id] = answer.value;
      else if (answer.scaleValue !== null) answers[question.id] = answer.scaleValue;
      else if (answer.textValue !== null) answers[question.id] = answer.textValue;
      else if (answer.selectedOptions) {
        answers[question.id] = question.type === "SINGLE_SELECT" ? (answer.selectedOptions[0] ?? null) : answer.selectedOptions;
      } else answers[question.id] = null;
    }
    const contactAnswer = contactQuestion ? answerMap.get(contactQuestion.id)?.selectedOptions?.[0] ?? null : null;
    return {
      responseId: response.id,
      invitationId: response.invitationId,
      contactId: contact.id,
      name: contact.fullName,
      organization: contact.organization,
      designation: contact.designation,
      email: contact.email,
      phone: contact.phone,
      profileUrl: contact.profileUrl,
      tags,
      submittedAt: response.submittedAt,
      industry: classifyIndustry(contact.organization, tags),
      role: classifyRole(contact.designation),
      interest: interestQuestion ? answerMap.get(interestQuestion.id)?.scaleValue ?? null : null,
      readiness: readinessScore(questions, answerMap),
      wantsContact: contactAnswer ? classifyOptionSentiment(contactAnswer) === "positive" : false,
      preferredContactMode: contactModeQuestion ? answerMap.get(contactModeQuestion.id)?.selectedOptions?.[0] ?? null : null,
      answers,
    };
  });

  /** Tallies one question's answers across an arbitrary subset of respondents. */
  type Subset = typeof respondents;
  function aggregate(question: (typeof questions)[number], subset: Subset) {
    const base = { id: question.id, prompt: question.prompt, type: question.type, section: question.section, options: question.options };
    const values = subset.map((r) => r.answers[question.id]).filter((v) => v !== null && v !== undefined);
    if (question.type === "YES_NO") {
      return { ...base, yes: values.filter((v) => v === true).length, no: values.filter((v) => v === false).length, responded: values.length };
    }
    if (question.type === "SINGLE_SELECT" || question.type === "MULTI_SELECT") {
      const tally = new Map<string, number>();
      for (const option of question.options ?? []) tally.set(option, 0);
      for (const value of values) {
        for (const picked of Array.isArray(value) ? value : [value as string]) {
          tally.set(picked, (tally.get(picked) ?? 0) + 1);
        }
      }
      return { ...base, counts: Array.from(tally, ([option, count]) => ({ option, count })), responded: values.length };
    }
    if (question.type === "SCALE_1_5") {
      const scales = values.filter((v): v is number => typeof v === "number");
      return {
        ...base,
        distribution: [1, 2, 3, 4, 5].map((n) => ({ value: n, count: scales.filter((v) => v === n).length })),
        average: scales.length ? scales.reduce((sum, v) => sum + v, 0) / scales.length : 0,
        responded: scales.length,
      };
    }
    const texts = values.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    return {
      ...base,
      responses: subset
        .filter((r) => typeof r.answers[question.id] === "string" && (r.answers[question.id] as string).trim())
        .map((r) => ({ respondentId: r.responseId, name: r.name, organization: r.organization, text: r.answers[question.id] as string })),
      words: wordFrequencies(texts),
      responded: texts.length,
    };
  }

  /** Groups respondents by a key, dropping empty groups, largest group first. */
  function groupBy<K extends string>(getKey: (r: Subset[number]) => K) {
    const map = new Map<K, Subset>();
    for (const respondent of respondents) {
      const key = getKey(respondent);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(respondent);
    }
    return Array.from(map, ([segment, members]) => ({ segment, members }))
      .sort((a, b) => b.members.length - a.members.length || a.segment.localeCompare(b.segment));
  }

  const byIndustry = groupBy((r) => r.industry);
  const byRole = groupBy((r) => r.role);
  const byOrganisation = groupBy((r) => r.organization?.trim() || "Not recorded");

  const average = (nums: number[]) => (nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0);

  /** Ranks the collaboration areas a group of respondents opted into most. */
  function topInterests(subset: Subset, limit = 5) {
    const tally = new Map<string, number>();
    for (const question of questions.filter((q) => q.type === "MULTI_SELECT")) {
      for (const respondent of subset) {
        for (const picked of (respondent.answers[question.id] as string[] | null) ?? []) {
          if (picked === "Other") continue;
          tally.set(picked, (tally.get(picked) ?? 0) + 1);
        }
      }
    }
    return Array.from(tally, ([option, count]) => ({ option, count }))
      .sort((a, b) => b.count - a.count || a.option.localeCompare(b.option))
      .slice(0, limit);
  }

  const segmentSummary = (groups: ReturnType<typeof groupBy>) =>
    groups.map(({ segment, members }) => ({
      segment,
      respondents: members.length,
      avgInterest: Number(average(members.map((m) => m.interest ?? 0).filter(Boolean)).toFixed(2)),
      avgReadiness: Math.round(average(members.map((m) => m.readiness))),
      wantsContact: members.filter((m) => m.wantsContact).length,
      topInterests: topInterests(members, 3),
    }));

  // Cross-question insight: how positively each questionnaire section was
  // answered overall, so the school can see which offers actually landed.
  const sectionOrder: string[] = [];
  const sectionQuestions = new Map<string, typeof questions>();
  for (const question of questions) {
    const key = question.section ?? "Ungrouped";
    if (!sectionQuestions.has(key)) { sectionQuestions.set(key, []); sectionOrder.push(key); }
    sectionQuestions.get(key)!.push(question);
  }
  const sectionEngagement = sectionOrder.map((section) => {
    const inSection = sectionQuestions.get(section)!;
    const scores = respondents.map((respondent) => {
      const answerMap = new Map(
        inSection.map((q) => {
          const value = respondent.answers[q.id];
          return [q.id, {
            value: typeof value === "boolean" ? value : null,
            textValue: typeof value === "string" ? value : null,
            scaleValue: typeof value === "number" ? value : null,
            selectedOptions: Array.isArray(value) ? value : typeof value === "string" && q.type === "SINGLE_SELECT" ? [value] : null,
          } as NormalizedAnswer];
        }),
      );
      return readinessScore(inSection, answerMap);
    });
    return { section, score: Math.round(average(scores)), questions: inSection.length };
  }).sort((a, b) => b.score - a.score);

  // Every option a respondent could opt into, ranked across the whole form —
  // the single clearest "what does industry actually want from us" view.
  const partnershipDemand = topInterests(respondents, 25);

  const hotLeads = respondents
    .filter((r) => r.wantsContact || (r.interest ?? 0) >= 4 || r.readiness >= 70)
    .sort((a, b) => b.readiness - a.readiness || (b.interest ?? 0) - (a.interest ?? 0))
    .map((r) => ({
      responseId: r.responseId, name: r.name, organization: r.organization, designation: r.designation,
      email: r.email, phone: r.phone, industry: r.industry, role: r.role,
      interest: r.interest, readiness: r.readiness, wantsContact: r.wantsContact,
      preferredContactMode: r.preferredContactMode,
    }));

  // Submissions per calendar day, so a staged rollout's uptake is visible.
  const timelineTally = new Map<string, number>();
  for (const respondent of respondents) {
    const day = respondent.submittedAt.toISOString().slice(0, 10);
    timelineTally.set(day, (timelineTally.get(day) ?? 0) + 1);
  }
  const timeline = Array.from(timelineTally, ([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day));

  res.json({
    survey: {
      id: survey.id, title: survey.title, status: survey.status,
      openedAt: survey.openedAt, closedAt: survey.closedAt,
    },
    completion: {
      arrived,
      submitted: respondents.length,
      outstanding: Math.max(0, arrived - respondents.length),
      rate: arrived ? Math.round((respondents.length / arrived) * 100) : 0,
    },
    headline: {
      avgInterest: Number(average(respondents.map((r) => r.interest ?? 0).filter(Boolean)).toFixed(2)),
      avgReadiness: Math.round(average(respondents.map((r) => r.readiness))),
      wantsContact: respondents.filter((r) => r.wantsContact).length,
      organisations: byOrganisation.length,
      industries: byIndustry.length,
      roles: byRole.length,
    },
    questions: questions.map((question) => ({
      ...aggregate(question, respondents),
      breakdowns: {
        byIndustry: byIndustry.map(({ segment, members }) => ({ segment, total: members.length, ...aggregate(question, members) })),
        byRole: byRole.map(({ segment, members }) => ({ segment, total: members.length, ...aggregate(question, members) })),
      },
    })),
    segments: {
      industries: segmentSummary(byIndustry),
      roles: segmentSummary(byRole),
      organisations: byOrganisation.map(({ segment, members }) => ({
        segment,
        respondents: members.length,
        avgInterest: Number(average(members.map((m) => m.interest ?? 0).filter(Boolean)).toFixed(2)),
        avgReadiness: Math.round(average(members.map((m) => m.readiness))),
        wantsContact: members.filter((m) => m.wantsContact).length,
      })),
    },
    derived: { sectionEngagement, partnershipDemand, hotLeads, timeline },
    respondents,
    readinessDistribution: [
      { band: "0–20", count: respondents.filter((r) => r.readiness <= 20).length },
      { band: "21–40", count: respondents.filter((r) => r.readiness > 20 && r.readiness <= 40).length },
      { band: "41–60", count: respondents.filter((r) => r.readiness > 40 && r.readiness <= 60).length },
      { band: "61–80", count: respondents.filter((r) => r.readiness > 60 && r.readiness <= 80).length },
      { band: "81–100", count: respondents.filter((r) => r.readiness > 80).length },
    ],
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
