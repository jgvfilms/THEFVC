/**
 * Invoicing service.
 *
 * Division of responsibility:
 *   Stripe  — source of truth for payment state (status, amounts paid).
 *   FVC     — source of truth for member linkage, production association,
 *             internal notes, and the follow-up schedule.
 *
 * We deliberately do NOT render invoice PDFs or host a pay page. Stripe's
 * hosted invoice page and PDF are free, tax-compliant, and mobile-friendly.
 */

import Stripe from "stripe";
import { stripe } from "./stripe-client";
import { storage } from "../storage";
import { encryptSensitive, decryptSensitive } from "./encryption";
import { log } from "./logger";
import type { Invoice, InvoiceReminder } from "@shared/schema";

export const REMINDER_TONES = ["friendly", "neutral", "firm", "final"] as const;
export type ReminderTone = (typeof REMINDER_TONES)[number];

export interface ReminderStep {
  offsetDays: number; // negative = before due, 0 = on due date, positive = overdue
  tone: ReminderTone;
}

/**
 * Follow-up cadences. Chosen per invoice at send time; the admin can also
 * add/remove individual steps, and whatever they end up with is persisted
 * to invoices.reminderProfile.
 */
export const REMINDER_PROFILES: Record<string, ReminderStep[]> = {
  standard: [
    { offsetDays: -3, tone: "friendly" },
    { offsetDays: 0, tone: "neutral" },
    { offsetDays: 3, tone: "neutral" },
    { offsetDays: 7, tone: "firm" },
    { offsetDays: 14, tone: "firm" },
    { offsetDays: 30, tone: "final" },
  ],
  gentle: [
    { offsetDays: 0, tone: "friendly" },
    { offsetDays: 7, tone: "friendly" },
    { offsetDays: 14, tone: "neutral" },
    { offsetDays: 21, tone: "neutral" },
  ],
  none: [],
};

export const REMINDER_HOUR_LOCAL = 9; // 9am
export const REMINDER_TIMEZONE = "America/New_York";
export const MAX_STRIPE_LINE_ITEMS = 250;

// ─────────────────────────────────────────────────────────────
// Timezone helpers
//
// Reminders must land at 9am in the recipient-facing business timezone, not
// 9am UTC. Naive UTC arithmetic drifts by an hour across the DST boundary,
// which is exactly when a 30-day offset from late October lands.
// ─────────────────────────────────────────────────────────────

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return asUtc - date.getTime();
}

/**
 * Returns the instant at which the wall clock in `timeZone` reads `hour:00`
 * on the calendar day of `day` (interpreted in UTC).
 * Two passes to settle correctly when the offset itself changes that day.
 */
export function atLocalHour(day: Date, hour: number, timeZone: string): Date {
  const y = day.getUTCFullYear();
  const m = day.getUTCMonth();
  const d = day.getUTCDate();
  const naive = Date.UTC(y, m, d, hour, 0, 0);
  let result = new Date(naive);
  for (let i = 0; i < 2; i++) {
    result = new Date(naive - tzOffsetMs(result, timeZone));
  }
  return result;
}

export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

// ─────────────────────────────────────────────────────────────
// Reminder scheduling
// ─────────────────────────────────────────────────────────────

export function parseReminderProfile(raw: string | null | undefined): ReminderStep[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s: any) =>
          typeof s?.offsetDays === "number" &&
          Number.isInteger(s.offsetDays) &&
          REMINDER_TONES.includes(s?.tone)
      )
      .map((s: any) => ({ offsetDays: s.offsetDays, tone: s.tone as ReminderTone }));
  } catch {
    return [];
  }
}

/**
 * Expand an invoice's reminder profile into concrete queue rows.
 * Idempotent: UNIQUE(invoice_id, offset_days) means re-running is a no-op.
 * Steps whose send time is already in the past are skipped, not backfilled —
 * nobody wants six reminders to fire at once because an invoice was sent late.
 */
export function scheduleReminders(invoiceId: number, now: Date = new Date()): number {
  const invoice = storage.getInvoice(invoiceId);
  if (!invoice || !invoice.remindersEnabled || !invoice.dueDate) return 0;

  const steps = parseReminderProfile(invoice.reminderProfile);
  let created = 0;

  for (const step of steps) {
    const day = addDays(invoice.dueDate, step.offsetDays);
    const sendAt = atLocalHour(day, REMINDER_HOUR_LOCAL, REMINDER_TIMEZONE);
    if (sendAt <= now) continue;

    const row = storage.createReminder({
      invoiceId,
      offsetDays: step.offsetDays,
      sendAt,
      tone: step.tone,
      status: "pending",
    });
    if (row) created++;
  }

  return created;
}

// ─────────────────────────────────────────────────────────────
// Stripe customer linkage
// ─────────────────────────────────────────────────────────────

/**
 * Get or lazily create the Stripe Customer for a member.
 * Lazy on purpose: batch-creating Customers for the whole member base would
 * litter the Stripe account with thousands of objects that never get billed.
 */
export async function ensureStripeCustomer(userId: number): Promise<string> {
  const profile = storage.getProfile(userId);
  const user = storage.getUser(userId);
  if (!user) throw new Error(`User ${userId} not found`);

  if (profile?.stripeCustomerId) {
    const decrypted = decryptSensitive(profile.stripeCustomerId) || profile.stripeCustomerId;
    if (decrypted) return decrypted;
  }

  const customer = await stripe.customers.create(
    {
      name: profile?.displayName || user.handle,
      email: user.email,
      metadata: { fvc_user_id: String(userId), fvc_handle: user.handle },
    },
    // Without this, a double-clicked Send creates two Customers for one member.
    { idempotencyKey: `fvc-customer-user-${userId}` }
  );

  storage.updateProfileSubscription(userId, {
    stripeCustomerId: encryptSensitive(customer.id),
  });

  return customer.id;
}

// ─────────────────────────────────────────────────────────────
// Send
// ─────────────────────────────────────────────────────────────

export interface SendResult {
  invoice: Invoice;
  hostedInvoiceUrl: string | null;
  remindersScheduled: number;
}

/**
 * Push a local draft to Stripe, finalize it, email it, and arm the follow-ups.
 *
 * Nothing touches Stripe while the invoice is being edited — a draft lives
 * entirely in our DB until this runs. That keeps abandoned drafts out of the
 * Stripe account and means edits are free.
 */
export async function sendInvoice(invoiceId: number, actorId: number): Promise<SendResult> {
  const invoice = storage.getInvoice(invoiceId);
  if (!invoice) throw new InvoicingError("Invoice not found", 404);
  if (invoice.status !== "draft") {
    throw new InvoicingError(`Only draft invoices can be sent (this one is ${invoice.status})`, 409);
  }
  if (!invoice.dueDate) throw new InvoicingError("Invoice has no due date", 400);

  const items = storage.getLineItems(invoiceId);
  if (items.length === 0) throw new InvoicingError("Invoice has no line items", 400);
  if (items.length > MAX_STRIPE_LINE_ITEMS) {
    throw new InvoicingError(`Stripe allows at most ${MAX_STRIPE_LINE_ITEMS} line items`, 400);
  }
  if (items.some((li) => li.amountCents < 0)) {
    throw new InvoicingError("Line item amounts cannot be negative", 400);
  }

  const user = storage.getUser(invoice.recipientUserId);
  if (!user) throw new InvoicingError("Recipient user no longer exists", 400);

  const customerId = await ensureStripeCustomer(invoice.recipientUserId);

  // 1. Draft on Stripe. auto_advance:false so finalization stays ours to trigger.
  const stripeDraft = await stripe.invoices.create(
    {
      customer: customerId,
      collection_method: "send_invoice",
      due_date: Math.floor(invoice.dueDate.getTime() / 1000),
      auto_advance: false,
      description: invoice.memo || undefined,
      metadata: {
        fvc_invoice_id: String(invoice.id),
        fvc_public_id: invoice.publicId,
        fvc_recipient_user_id: String(invoice.recipientUserId),
      },
    },
    { idempotencyKey: `fvc-invoice-create-${invoice.id}` }
  );

  // 2. Line items.
  for (const li of items) {
    const created = await stripe.invoiceItems.create(
      {
        customer: customerId,
        invoice: stripeDraft.id,
        description: li.description,
        quantity: li.quantity,
        unit_amount: li.unitAmountCents,
        currency: invoice.currency,
      },
      { idempotencyKey: `fvc-invoice-${invoice.id}-li-${li.id}` }
    );
    storage.updateLineItemStripeId(li.id, created.id);
  }

  // 3. Finalize — generates the invoice number, PDF, and hosted pay URL.
  const finalized = await stripe.invoices.finalizeInvoice(stripeDraft.id);

  // 4. Email it. Stripe attaches the PDF.
  const sent = await stripe.invoices.sendInvoice(finalized.id);

  const updated = storage.updateInvoice(invoice.id, {
    stripeInvoiceId: sent.id,
    stripeCustomerId: encryptSensitive(customerId),
    status: "open",
    hostedInvoiceUrl: sent.hosted_invoice_url ?? null,
    invoicePdfUrl: sent.invoice_pdf ?? null,
    subtotalCents: sent.subtotal ?? invoice.subtotalCents,
    totalCents: sent.total ?? invoice.totalCents,
    amountDueCents: sent.amount_due ?? invoice.amountDueCents,
    issuedAt: new Date(),
  })!;

  storage.logInvoiceEvent({
    invoiceId: invoice.id,
    eventType: "sent",
    source: "admin",
    actorId,
    payload: JSON.stringify({ stripeInvoiceId: sent.id, to: invoice.recipientEmail }),
  });

  const remindersScheduled = scheduleReminders(invoice.id);

  log(`[invoicing] Sent ${invoice.publicId} to ${invoice.recipientEmail} (${remindersScheduled} reminders armed)`, "invoicing");

  return {
    invoice: updated,
    hostedInvoiceUrl: sent.hosted_invoice_url ?? null,
    remindersScheduled,
  };
}

// ─────────────────────────────────────────────────────────────
// Void / mark paid / sync
// ─────────────────────────────────────────────────────────────

export async function voidInvoice(invoiceId: number, actorId: number): Promise<Invoice> {
  const invoice = storage.getInvoice(invoiceId);
  if (!invoice) throw new InvoicingError("Invoice not found", 404);
  if (invoice.status !== "open") {
    throw new InvoicingError(`Only open invoices can be voided (this one is ${invoice.status})`, 409);
  }
  if (!invoice.stripeInvoiceId) throw new InvoicingError("Invoice has no Stripe record", 409);

  await stripe.invoices.voidInvoice(invoice.stripeInvoiceId);

  const updated = storage.updateInvoice(invoiceId, { status: "void", voidedAt: new Date() })!;
  storage.cancelPendingReminders(invoiceId);
  storage.logInvoiceEvent({
    invoiceId,
    eventType: "voided",
    source: "admin",
    actorId,
    payload: "{}",
  });
  return updated;
}

/**
 * Record an out-of-band payment (check, cash, bank transfer).
 *
 * Routed through Stripe rather than flipped locally so Stripe stays the single
 * source of truth AND so the resulting invoice.paid webhook cancels reminders
 * through the same path as a card payment — one code path, not two.
 */
export async function markInvoicePaidOutOfBand(invoiceId: number, actorId: number): Promise<Invoice> {
  const invoice = storage.getInvoice(invoiceId);
  if (!invoice) throw new InvoicingError("Invoice not found", 404);
  if (invoice.status !== "open") {
    throw new InvoicingError(`Only open invoices can be marked paid (this one is ${invoice.status})`, 409);
  }
  if (!invoice.stripeInvoiceId) throw new InvoicingError("Invoice has no Stripe record", 409);

  const paid = await stripe.invoices.pay(invoice.stripeInvoiceId, { paid_out_of_band: true });

  storage.logInvoiceEvent({
    invoiceId,
    eventType: "paid",
    source: "admin",
    actorId,
    payload: JSON.stringify({ outOfBand: true }),
  });

  return syncInvoiceFromStripe(paid) ?? storage.getInvoice(invoiceId)!;
}

/** Mirror a Stripe invoice object onto the local row. */
export function syncInvoiceFromStripe(stripeInvoice: Stripe.Invoice): Invoice | undefined {
  const local = stripeInvoice.id ? storage.getInvoiceByStripeId(stripeInvoice.id) : undefined;
  if (!local) return undefined;

  const status = mapStripeStatus(stripeInvoice.status);
  const wasUnpaid = local.status === "open";

  const updated = storage.updateInvoice(local.id, {
    status,
    amountPaidCents: stripeInvoice.amount_paid ?? local.amountPaidCents,
    amountDueCents: stripeInvoice.amount_due ?? local.amountDueCents,
    totalCents: stripeInvoice.total ?? local.totalCents,
    subtotalCents: stripeInvoice.subtotal ?? local.subtotalCents,
    hostedInvoiceUrl: stripeInvoice.hosted_invoice_url ?? local.hostedInvoiceUrl,
    invoicePdfUrl: stripeInvoice.invoice_pdf ?? local.invoicePdfUrl,
    paidAt: status === "paid" ? local.paidAt ?? new Date() : local.paidAt,
    voidedAt: status === "void" ? local.voidedAt ?? new Date() : local.voidedAt,
  });

  // The single most important line in this module. Emailing someone a payment
  // demand after they've already paid is the failure mode that costs you the
  // relationship, and it is entirely preventable.
  if (wasUnpaid && status !== "open") {
    storage.cancelPendingReminders(local.id);
  }

  return updated;
}

export function mapStripeStatus(status: Stripe.Invoice.Status | null): string {
  switch (status) {
    case "draft":
      return "draft";
    case "open":
      return "open";
    case "paid":
      return "paid";
    case "void":
      return "void";
    case "uncollectible":
      return "uncollectible";
    default:
      return "open";
  }
}

/** Pull the current Stripe state for an invoice and mirror it locally. */
export async function refreshInvoiceFromStripe(invoiceId: number): Promise<Invoice | undefined> {
  const invoice = storage.getInvoice(invoiceId);
  if (!invoice?.stripeInvoiceId) return invoice;
  const live = await stripe.invoices.retrieve(invoice.stripeInvoiceId);
  return syncInvoiceFromStripe(live);
}

export class InvoicingError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = "InvoicingError";
  }
}

export function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function isOverdue(invoice: Invoice, now: Date = new Date()): boolean {
  return invoice.status === "open" && !!invoice.dueDate && invoice.dueDate < now;
}

export function daysOverdue(invoice: Invoice, now: Date = new Date()): number {
  if (!invoice.dueDate) return 0;
  return Math.max(0, Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86400000));
}

export type { InvoiceReminder };
