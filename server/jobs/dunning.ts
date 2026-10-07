/**
 * Dunning worker — sends the automatic follow-ups for unpaid invoices.
 *
 * Runs every 15 minutes. Each pass picks up reminders whose send time has
 * arrived, re-verifies the invoice against Stripe, and queues the email.
 *
 * IMPORTANT — Stripe's own reminder engine must stay OFF.
 * Dashboard > Settings > Billing > Subscriptions and emails >
 *   "Send reminders if a recurring invoice hasn't been paid"  ->  disabled.
 * Stripe's reminders are account-level only (they can't do per-invoice
 * cadence), and running both means every member gets nagged twice.
 */

import { storage } from "../storage";
import { stripe, isStripeConfigured } from "../lib/stripe-client";
import {
  syncInvoiceFromStripe,
  formatCents,
  daysOverdue,
  type ReminderTone,
} from "../lib/invoicing";
import { queueEmail } from "../email/queue";
import { invoiceReminderTemplate } from "../email/templates";
import { log } from "../lib/logger";
import type { Invoice, InvoiceReminder } from "@shared/schema";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 100;

export interface DunningResult {
  queued: number;
  skipped: number;
  failed: number;
}

/**
 * One dunning pass.
 * Safe to run concurrently with itself only in the sense that duplicate sends
 * are bounded by the reminder row's status flip — but see the single-worker
 * note in the deploy guide: run this in one process only.
 */
export async function runDunningPass(now: Date = new Date()): Promise<DunningResult> {
  const result: DunningResult = { queued: 0, skipped: 0, failed: 0 };

  if (!isStripeConfigured()) {
    return result;
  }

  const due = storage.getDueReminders(now, BATCH_SIZE);

  for (const reminder of due) {
    const invoice = storage.getInvoice(reminder.invoiceId);

    // Invoice deleted, reminders switched off, or already in a terminal state.
    if (!invoice || !invoice.remindersEnabled || invoice.status !== "open") {
      storage.updateReminder(reminder.id, { status: "skipped" });
      result.skipped++;
      continue;
    }

    if (!invoice.stripeInvoiceId || !invoice.hostedInvoiceUrl) {
      storage.updateReminder(reminder.id, {
        status: "skipped",
        error: "Invoice has no Stripe record or pay URL",
      });
      result.skipped++;
      continue;
    }

    // Re-verify against Stripe before every send.
    //
    // This is deliberate belt-and-braces. Webhooks get missed — a deploy
    // mid-delivery, a 500 from the app, a misconfigured endpoint. Without this
    // check, one dropped invoice.paid means a member who already paid receives
    // escalating payment demands for a month. The extra API call is cheap
    // insurance against the worst failure this feature can produce.
    let stillOwed = true;
    try {
      const live = await stripe.invoices.retrieve(invoice.stripeInvoiceId);
      if (live.status !== "open" || (live.amount_due ?? 0) === 0) {
        syncInvoiceFromStripe(live);
        stillOwed = false;
      }
    } catch (err: any) {
      // Can't confirm the balance is still owed, so don't send. Retry next pass.
      const attempts = reminder.attempts + 1;
      storage.updateReminder(reminder.id, {
        attempts,
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        error: `Stripe verify failed: ${String(err?.message || err)}`,
      });
      result.failed++;
      continue;
    }

    if (!stillOwed) {
      storage.updateReminder(reminder.id, { status: "skipped", error: "Already settled" });
      result.skipped++;
      continue;
    }

    try {
      await queueReminderEmail(invoice, reminder, now);
      storage.updateReminder(reminder.id, {
        status: "sent",
        sentAt: now,
        attempts: reminder.attempts + 1,
      });
      storage.logInvoiceEvent({
        invoiceId: invoice.id,
        eventType: "reminder_sent",
        source: "dunning_worker",
        actorId: null,
        payload: JSON.stringify({ offsetDays: reminder.offsetDays, tone: reminder.tone }),
      });
      result.queued++;
    } catch (err: any) {
      const attempts = reminder.attempts + 1;
      storage.updateReminder(reminder.id, {
        attempts,
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        error: String(err?.message || err),
      });
      result.failed++;
    }
  }

  return result;
}

/**
 * Build and queue one reminder email.
 * Goes through the existing email_queue so it inherits retries and delivery
 * logging rather than reimplementing them.
 */
export async function queueReminderEmail(
  invoice: Invoice,
  reminder: Pick<InvoiceReminder, "tone">,
  now: Date = new Date()
): Promise<void> {
  const production = invoice.productionId
    ? storage.getProduction(invoice.productionId)
    : undefined;

  const template = invoiceReminderTemplate({
    tone: reminder.tone as ReminderTone,
    publicId: invoice.publicId,
    recipientName: invoice.recipientName,
    amountDue: formatCents(invoice.amountDueCents, invoice.currency),
    dueDate: invoice.dueDate
      ? invoice.dueDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "America/New_York",
        })
      : "on receipt",
    daysOverdue: daysOverdue(invoice, now),
    hostedInvoiceUrl: invoice.hostedInvoiceUrl,
    productionTitle: production?.title,
    replyTo: process.env.INVOICE_REPLY_TO,
    // invoice.internalNote is intentionally absent. It is admin-only.
  });

  await queueEmail({
    to: invoice.recipientEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    metadata: {
      kind: "invoice_reminder",
      invoiceId: invoice.id,
      publicId: invoice.publicId,
      tone: reminder.tone,
    },
  });
}

/** Manual "send a reminder now" from the admin UI. */
export async function sendManualReminder(
  invoiceId: number,
  tone: ReminderTone,
  actorId: number
): Promise<void> {
  const invoice = storage.getInvoice(invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "open") throw new Error(`Invoice is ${invoice.status}, not open`);
  if (!invoice.hostedInvoiceUrl) throw new Error("Invoice has no pay URL yet");

  await queueReminderEmail(invoice, { tone });

  storage.logInvoiceEvent({
    invoiceId,
    eventType: "reminder_sent",
    source: "admin",
    actorId,
    payload: JSON.stringify({ tone, manual: true }),
  });

  log(`[dunning] Manual ${tone} reminder queued for ${invoice.publicId}`, "jobs");
}
