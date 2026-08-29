import { Router } from "express";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { broadcastConversation } from "../lib/supabase.js";

export const networkRouter = Router();
networkRouter.use(requireAuth);

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  organization: z.string().trim().max(160).nullish(),
  designation: z.string().trim().max(160).nullish(),
  headline: z.string().trim().max(240).nullish(),
  bio: z.string().trim().max(2000).nullish(),
  publicEmail: z.string().trim().email().nullish().or(z.literal("").transform(() => null)),
  linkedInUrl: z.string().trim().url().nullish().or(z.literal("").transform(() => null)),
  discoverable: z.boolean(),
  shareDesignation: z.boolean(),
  shareHeadline: z.boolean(),
  shareBio: z.boolean(),
  shareEmail: z.boolean(),
  shareLinkedIn: z.boolean(),
});

/** Accounts that run the platform rather than take part in it — never
 * discoverable, never connectable. Mirrors routes/auth.ts. */
const OPERATOR_ROLES: Role[] = ["ADMIN", "STAFF"];

const pairKey = (a: string, b: string) => [a, b].sort().join(":");

async function isBlocked(a: string, b: string) {
  return !!(await prisma.userBlock.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  }));
}

networkRouter.get("/profile", async (req, res) => {
  const profile = await prisma.networkProfile.findUnique({ where: { userId: req.user!.id } });
  res.json({ profile });
});

networkRouter.put("/profile", async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid profile." });
  const profile = await prisma.networkProfile.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, ...parsed.data },
    update: parsed.data,
  });
  res.json({ profile });
});

networkRouter.get("/people", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const take = Math.min(Number(req.query.limit) || 30, 50);
  const blocked = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: req.user!.id }, { blockedId: req.user!.id }] },
    select: { blockerId: true, blockedId: true },
  });
  const excluded = blocked.flatMap((b) => [b.blockerId, b.blockedId]).filter((id) => id !== req.user!.id);
  const profiles = await prisma.networkProfile.findMany({
    where: {
      userId: { notIn: [req.user!.id, ...excluded] },
      discoverable: true,
      adminVisible: true,
      // Belt and braces alongside the discoverable flag set at sign-in: an
      // operator account must never be listed, whatever its profile says.
      user: { role: { notIn: OPERATOR_ROLES } },
      ...(q ? {
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { organization: { contains: q, mode: "insensitive" } },
        ],
      } : {}),
    },
    include: { user: { select: { role: true } } },
    orderBy: { displayName: "asc" },
    take,
  });
  const connections = await prisma.connection.findMany({
    where: {
      OR: [
        { requesterId: req.user!.id, recipientId: { in: profiles.map((p) => p.userId) } },
        { recipientId: req.user!.id, requesterId: { in: profiles.map((p) => p.userId) } },
      ],
    },
  });
  res.json({
    people: profiles.map((p) => {
      const connection = connections.find((c) => c.pairKey === pairKey(req.user!.id, p.userId));
      const accepted = connection?.status === "ACCEPTED";
      return {
        userId: p.userId,
        displayName: p.displayName,
        organization: p.organization,
        role: accepted && p.shareDesignation ? p.user.role : undefined,
        designation: accepted && p.shareDesignation ? p.designation : undefined,
        headline: accepted && p.shareHeadline ? p.headline : undefined,
        bio: accepted && p.shareBio ? p.bio : undefined,
        publicEmail: accepted && p.shareEmail ? p.publicEmail : undefined,
        linkedInUrl: accepted && p.shareLinkedIn ? p.linkedInUrl : undefined,
        connection: connection ? { id: connection.id, status: connection.status, requesterId: connection.requesterId } : null,
      };
    }),
  });
});

networkRouter.get("/connections", async (req, res) => {
  const connections = await prisma.connection.findMany({
    where: { OR: [{ requesterId: req.user!.id }, { recipientId: req.user!.id }] },
    include: {
      requester: { include: { profile: true } },
      recipient: { include: { profile: true } },
      conversation: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ connections });
});

networkRouter.post("/connections", async (req, res) => {
  const parsed = z.object({ recipientId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success || parsed.data.recipientId === req.user!.id) return res.status(400).json({ error: "Invalid recipient." });
  if (await isBlocked(req.user!.id, parsed.data.recipientId)) return res.status(403).json({ error: "Connection unavailable." });
  const recipient = await prisma.networkProfile.findFirst({
    where: {
      userId: parsed.data.recipientId,
      discoverable: true,
      adminVisible: true,
      user: { role: { notIn: OPERATOR_ROLES } },
    },
  });
  if (!recipient) return res.status(404).json({ error: "Profile not found." });
  const key = pairKey(req.user!.id, parsed.data.recipientId);
  const existing = await prisma.connection.findUnique({ where: { pairKey: key } });
  if (existing && ["PENDING", "ACCEPTED"].includes(existing.status)) {
    return res.status(409).json({ error: "A connection already exists." });
  }
  const connection = await prisma.connection.upsert({
    where: { pairKey: key },
    create: { pairKey: key, requesterId: req.user!.id, recipientId: parsed.data.recipientId },
    update: { requesterId: req.user!.id, recipientId: parsed.data.recipientId, status: "PENDING", respondedAt: null },
  });
  await prisma.notification.create({
    data: {
      userId: parsed.data.recipientId,
      type: "CONNECTION_REQUEST",
      title: `${req.user!.name} sent you a connection request`,
      entityType: "Connection",
      entityId: connection.id,
    },
  });
  res.status(201).json({ connection });
});

networkRouter.patch("/connections/:id", async (req, res) => {
  const parsed = z.object({ action: z.enum(["ACCEPT", "DECLINE", "CANCEL", "REMOVE"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid action." });
  const connection = await prisma.connection.findUnique({ where: { id: req.params.id } });
  if (!connection) return res.status(404).json({ error: "Connection not found." });
  const isRequester = connection.requesterId === req.user!.id;
  const isRecipient = connection.recipientId === req.user!.id;
  if (!isRequester && !isRecipient) return res.status(403).json({ error: "Not permitted." });
  if (["ACCEPT", "DECLINE"].includes(parsed.data.action) && !isRecipient) return res.status(403).json({ error: "Only the recipient can respond." });
  if (parsed.data.action === "CANCEL" && !isRequester) return res.status(403).json({ error: "Only the requester can cancel." });
  const next = ({ ACCEPT: "ACCEPTED", DECLINE: "DECLINED", CANCEL: "CANCELLED", REMOVE: "REMOVED" } as const)[parsed.data.action];
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.connection.update({
      where: { id: connection.id },
      data: { status: next, respondedAt: new Date() },
    });
    if (next === "ACCEPTED") {
      await tx.conversation.create({
        data: {
          connectionId: connection.id,
          participants: { create: [{ userId: connection.requesterId }, { userId: connection.recipientId }] },
        },
      });
      await tx.notification.create({
        data: {
          userId: connection.requesterId,
          type: "CONNECTION_ACCEPTED",
          title: `${req.user!.name} accepted your connection request`,
          entityType: "Connection",
          entityId: connection.id,
        },
      });
    }
    return value;
  });
  res.json({ connection: updated });
});

networkRouter.post("/blocks", async (req, res) => {
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success || parsed.data.userId === req.user!.id) return res.status(400).json({ error: "Invalid user." });
  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId: parsed.data.userId } },
      create: { blockerId: req.user!.id, blockedId: parsed.data.userId },
      update: {},
    }),
    prisma.connection.updateMany({
      where: { pairKey: pairKey(req.user!.id, parsed.data.userId) },
      data: { status: "REMOVED" },
    }),
  ]);
  res.status(204).end();
});

networkRouter.get("/conversations", async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId: req.user!.id } }, connection: { status: "ACCEPTED" } },
    include: {
      participants: { include: { user: { include: { profile: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });
  res.json({
    conversations: conversations.map((c) => ({
      ...c,
      other: c.participants.find((p) => p.userId !== req.user!.id)?.user,
    })),
  });
});

networkRouter.get("/conversations/:id/messages", async (req, res) => {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: req.params.id, userId: req.user!.id } },
  });
  if (!participant) return res.status(403).json({ error: "Not permitted." });
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.id },
    include: { sender: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  res.json({ messages: messages.slice(0, 50).reverse(), nextCursor: messages.length > 50 ? messages[49]?.id : null });
});

networkRouter.post("/conversations/:id/messages", async (req, res) => {
  const parsed = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Message must be between 1 and 4,000 characters." });
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: req.params.id,
      connection: { status: "ACCEPTED" },
      participants: { some: { userId: req.user!.id } },
    },
    include: { participants: true },
  });
  if (!conversation) return res.status(403).json({ error: "Not permitted." });
  const message = await prisma.$transaction(async (tx) => {
    const value = await tx.message.create({
      data: { conversationId: conversation.id, senderId: req.user!.id, body: parsed.data.body },
    });
    await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    const recipient = conversation.participants.find((p) => p.userId !== req.user!.id);
    if (recipient) await tx.notification.create({
      data: {
        userId: recipient.userId,
        type: "NEW_MESSAGE",
        title: `New message from ${req.user!.name}`,
        entityType: "Conversation",
        entityId: conversation.id,
      },
    });
    return value;
  });
  await broadcastConversation(conversation.id, message.id);
  res.status(201).json({ message });
});

networkRouter.post("/conversations/:id/read", async (req, res) => {
  const result = await prisma.conversationParticipant.updateMany({
    where: { conversationId: req.params.id, userId: req.user!.id },
    data: { lastReadAt: new Date() },
  });
  if (!result.count) return res.status(404).json({ error: "Conversation not found." });
  res.status(204).end();
});
