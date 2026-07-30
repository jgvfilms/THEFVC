import { Resend } from "resend";
import { db } from "../storage";
import { emailQueue } from "@shared/schema";
import type { InsertEmailQueue, EmailQueue } from "@shared/schema";
import { eq, and, lte, desc } from "drizzle-orm";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY || "");

const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@thefvc.is";

/**
 * Queue an email for sending.
 * Inserts a row into the email_queue table with status 'pending'.
 * The background job processor will pick it up.
 */
export async function queueEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  scheduledAt?: Date;
  metadata?: Record<string, any>;
}): Promise<EmailQueue> {
  const result = await db
    .insert(emailQueue)
    .values({
      to: opts.to,
      from: FROM_EMAIL,
      subject: opts.subject,
      html: opts.html,
      text: opts.text || undefined,
      status: "pending",
      provider: "resend",
      scheduledAt: opts.scheduledAt || new Date(),
      metadata: JSON.stringify(opts.metadata || {}),
    })
    .returning()
    .get();
  return result;
}

/**
 * Send a single email via Resend.
 * Updates the email_queue row with the result.
 */
export async function sendEmail(id: number): Promise<boolean> {
  const email = await db.select().from(emailQueue).where(eq(emailQueue.id, id)).get();
  if (!email) return false;

  // Mark as sending
  await db
    .update(emailQueue)
    .set({ status: "sending", retryCount: email.retryCount + 1 })
    .where(eq(emailQueue.id, id))
    .run();

  try {
    const result = await resend.emails.send({
      from: email.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text || undefined,
    });

    if (result.error) {
      throw new Error(result.error.message || "Resend API error");
    }

    await db
      .update(emailQueue)
      .set({
        status: "sent",
        sentAt: new Date(),
        providerMessageId: result.data?.id || null,
      })
      .where(eq(emailQueue.id, id))
      .run();

    return true;
  } catch (err: any) {
    const errorMsg = err.message || "Unknown error";
    const newRetryCount = email.retryCount + 1;

    if (newRetryCount >= email.maxRetries) {
      await db
        .update(emailQueue)
        .set({
          status: "failed",
          failedAt: new Date(),
          error: errorMsg,
        })
        .where(eq(emailQueue.id, id))
        .run();
    } else {
      await db
        .update(emailQueue)
        .set({
          status: "pending",
          error: errorMsg,
        })
        .where(eq(emailQueue.id, id))
        .run();
    }

    return false;
  }
}

/**
 * Process all pending emails that are scheduled to be sent.
 * Called by the background job scheduler.
 */
export async function processEmailQueue(): Promise<{ sent: number; failed: number }> {
  const pendingEmails = await db
    .select()
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.status, "pending"),
        lte(emailQueue.scheduledAt, new Date())
      )
    )
    .orderBy(desc(emailQueue.createdAt))
    .all();

  let sent = 0;
  let failed = 0;

  for (const email of pendingEmails) {
    const success = await sendEmail(email.id);
    if (success) sent++;
    else failed++;
  }

  return { sent, failed };
}

/**
 * Get email queue statistics.
 */
export async function getEmailStats(): Promise<{
  pending: number;
  sending: number;
  sent: number;
  failed: number;
}> {
  const stats = await db
    .select({
      status: emailQueue.status,
      count: db.$count(emailQueue),
    })
    .from(emailQueue)
    .groupBy(emailQueue.status)
    .all();

  const result = { pending: 0, sending: 0, sent: 0, failed: 0 };
  for (const row of stats) {
    if (row.status in result) {
      (result as any)[row.status] = Number(row.count);
    }
  }
  return result;
}
