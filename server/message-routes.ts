/**
 * Member-to-member messaging. Members send and reply themselves in the app;
 * there is intentionally no way for an AI token to send (see mcp-routes).
 *
 * The recipient gets an in-app notification and, unless they opted out, an
 * email that names the sender but never includes the message text.
 */
import type { Express, Response } from "express";
import { z } from "zod";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, storage } from "./storage";
import { messages } from "@shared/schema";
import { requireAuth, type AuthedRequest } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import { isBlockedEitherWay } from "./network-routes";
import { queueEmail, newMessageTemplate } from "./email";

export const MAX_MESSAGE_LENGTH = 2000;
// Per-sender daily cap so a member can't use the inbox as a bulk mailer.
export const MAX_MESSAGES_PER_DAY = 30;

const sendSchema = z.object({
  toHandle: z.string().min(1).max(64),
  body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "https://www.thefvc.is";
}

export function registerMessageRoutes(app: Express) {
  app.use("/api/messages", rateLimit({ windowMs: 60 * 1000, max: 60, identifier: "messages" }));

  app.post("/api/messages", requireAuth, async (req: AuthedRequest, res: Response) => {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Write a message of 1 to 2000 characters." });

    const sender = storage.getUser(req.userId!);
    const recipient = storage.getUserByHandle(parsed.data.toHandle);
    // Same answer for "no such member" and "not active" so handles can't be probed.
    if (!sender || !recipient || recipient.accessStatus !== "active") {
      return res.status(404).json({ error: "Member not found." });
    }
    if (recipient.id === sender.id) return res.status(400).json({ error: "You can't message yourself." });
    // A block in either direction looks the same as an unknown member. Existing threads stay readable.
    if (isBlockedEitherWay(sender.id, recipient.id)) return res.status(404).json({ error: "Member not found." });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sentToday = db
      .select({ n: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.senderId, sender.id), gt(messages.createdAt, since)))
      .get()?.n ?? 0;
    if (sentToday >= MAX_MESSAGES_PER_DAY) {
      return res.status(429).json({ error: "Daily message limit reached. Try again tomorrow." });
    }

    const message = db
      .insert(messages)
      .values({ senderId: sender.id, recipientId: recipient.id, body: parsed.data.body })
      .returning()
      .get();

    const senderName = storage.getProfile(sender.id)?.displayName || sender.handle;
    storage.createNotification({
      userId: recipient.id,
      type: "message",
      title: `New message from ${senderName}`,
      message: null,
      linkUrl: "/app/messages",
      metadata: JSON.stringify({ messageId: message.id, fromHandle: sender.handle }),
    } as any);

    if (recipient.emailOnMessage !== false) {
      const recipientName = storage.getProfile(recipient.id)?.displayName || recipient.handle;
      const tpl = newMessageTemplate({ recipientName, senderName, inboxUrl: `${baseUrl()}/app/messages` });
      try {
        await queueEmail({ to: recipient.email, ...tpl, metadata: { type: "new_message", userId: recipient.id } });
      } catch (err) {
        // The message is saved and the in-app notice exists; a mail failure must not fail the send.
        console.error("[messages] could not queue notification email", err);
      }
    }
    res.status(201).json({ id: message.id, createdAt: message.createdAt });
  });

  // Conversation list: one row per other member, newest first, with unread count.
  app.get("/api/messages", requireAuth, (req: AuthedRequest, res: Response) => {
    res.json(
      storage.listConversations(req.userId!).map((c) => {
        const other = storage.getUser(c.otherId);
        return {
          handle: other?.handle ?? null,
          displayName: (other && storage.getProfile(other.id)?.displayName) || other?.handle || "Former member",
          lastBody: c.last.body.slice(0, 140),
          lastAt: c.last.createdAt,
          unread: c.unread,
        };
      }),
    );
  });

  app.get("/api/messages/unread-count", requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ unread: storage.countUnreadMessages(req.userId!) });
  });

  // Opening a conversation marks what the other member sent as read.
  app.get("/api/messages/with/:handle", requireAuth, (req: AuthedRequest, res: Response) => {
    const me = req.userId!;
    const handle = Array.isArray(req.params.handle) ? req.params.handle[0] : req.params.handle;
    const other = storage.getUserByHandle(handle);
    if (!other) return res.status(404).json({ error: "Member not found." });
    const thread = storage.getThread(me, other.id);
    db.update(messages)
      .set({ readAt: new Date() })
      .where(and(eq(messages.senderId, other.id), eq(messages.recipientId, me), isNull(messages.readAt)))
      .run();
    res.json(thread.map((m) => ({ id: m.id, mine: m.senderId === me, body: m.body, createdAt: m.createdAt })));
  });
}
