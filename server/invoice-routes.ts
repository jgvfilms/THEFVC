/**
 * Invoicing API routes.
 *
 * Admin routes create/edit/send invoices. The member route is read-only and
 * scoped strictly to the session user — there is deliberately no :userId path
 * parameter anywhere in it, because that shape is exactly how the IDOR bug on
 * the crew endpoints happened.
 */

import type { Express, Response } from "express";
import { z } from "zod";
import { storage } from "./storage";
import { requireAuth, requireAdmin, type AuthedRequest } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import {
  sendInvoice,
  voidInvoice,
  markInvoicePaidOutOfBand,
  refreshInvoiceFromStripe,
  scheduleReminders,
  parseReminderProfile,
  REMINDER_PROFILES,
  REMINDER_TONES,
  InvoicingError,
  isOverdue,
} from "./lib/invoicing";
import { sendManualReminder } from "./jobs/dunning";
import { isStripeConfigured } from "./lib/stripe-client";
import type { Invoice } from "@shared/schema";

const MAX_UNIT_AMOUNT_CENTS = 99_999_999; // $999,999.99
const MAX_QUANTITY = 999;

const lineItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().min(1).max(MAX_QUANTITY).default(1),
  unitAmountCents: z.number().int().min(0).max(MAX_UNIT_AMOUNT_CENTS),
});

const reminderStepSchema = z.object({
  offsetDays: z.number().int().min(-90).max(365),
  tone: z.enum(REMINDER_TONES),
});

const createInvoiceSchema = z.object({
  recipientUserId: z.number().int().positive(),
  productionId: z.number().int().positive().nullish(),
  dueDate: z.string().datetime().or(z.string().min(8)),
  memo: z.string().max(2000).nullish(),
  internalNote: z.string().max(2000).nullish(),
  lineItems: z.array(lineItemSchema).min(1).max(250),
  remindersEnabled: z.boolean().default(true),
  reminderProfileName: z.enum(["standard", "gentle", "none", "custom"]).default("standard"),
  reminderSteps: z.array(reminderStepSchema).max(20).optional(),
});

const updateInvoiceSchema = createInvoiceSchema.partial().omit({ recipientUserId: true });

/**
 * Shape an invoice for the client.
 * `internalNote` is stripped for non-admins. `hostedInvoiceUrl` is an
 * unauthenticated pay link, so it only ever goes to the invoice's own
 * recipient or an admin.
 */
function serializeInvoice(invoice: Invoice, opts: { admin: boolean }) {
  const base = {
    id: invoice.id,
    publicId: invoice.publicId,
    status: invoice.status,
    overdue: isOverdue(invoice),
    currency: invoice.currency,
    subtotalCents: invoice.subtotalCents,
    totalCents: invoice.totalCents,
    amountPaidCents: invoice.amountPaidCents,
    amountDueCents: invoice.amountDueCents,
    dueDate: invoice.dueDate,
    issuedAt: invoice.issuedAt,
    paidAt: invoice.paidAt,
    voidedAt: invoice.voidedAt,
    memo: invoice.memo,
    hostedInvoiceUrl: invoice.hostedInvoiceUrl,
    invoicePdfUrl: invoice.invoicePdfUrl,
    productionId: invoice.productionId,
    recipientUserId: invoice.recipientUserId,
    recipientName: invoice.recipientName,
    createdAt: invoice.createdAt,
  };

  if (!opts.admin) return base;

  return {
    ...base,
    recipientEmail: invoice.recipientEmail,
    internalNote: invoice.internalNote,
    remindersEnabled: invoice.remindersEnabled,
    reminderProfile: parseReminderProfile(invoice.reminderProfile),
    stripeInvoiceId: invoice.stripeInvoiceId,
  };
}

function resolveReminderSteps(input: {
  reminderProfileName?: string;
  reminderSteps?: Array<{ offsetDays: number; tone: string }>;
}) {
  if (input.reminderProfileName === "custom") return input.reminderSteps ?? [];
  return REMINDER_PROFILES[input.reminderProfileName ?? "standard"] ?? REMINDER_PROFILES.standard;
}

/** Express 5 types route params as string | string[]. Narrow and validate. */
function paramId(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvoicingError("Invalid invoice id", 400);
  }
  return parsed;
}

function parseDueDate(raw: string): Date {
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) throw new InvoicingError("Invalid due date", 400);
  return parsed;
}

function handleError(res: Response, err: any) {
  if (err instanceof InvoicingError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.issues });
  }
  // Stripe errors carry a useful message but can also carry request details we
  // don't want to echo verbatim to the browser.
  if (err?.type?.startsWith?.("Stripe")) {
    console.error("[invoicing] Stripe error:", err.message);
    return res.status(502).json({ error: `Stripe: ${err.message}` });
  }
  console.error("[invoicing] Unexpected error:", err);
  return res.status(500).json({ error: "Internal error" });
}

export function registerInvoiceRoutes(app: Express): void {
  app.use("/api/admin/invoices", rateLimit({ windowMs: 60 * 1000, max: 60, identifier: "invoices-admin" }));
  app.use("/api/me/invoices", rateLimit({ windowMs: 60 * 1000, max: 60, identifier: "invoices-me" }));

  // ── Member-facing: strictly own invoices ─────────────────────
  app.get("/api/me/invoices", requireAuth, async (req: AuthedRequest, res: Response) => {
    const list = storage.listInvoicesForUser(req.userId!);
    res.json({ invoices: list.map((i) => serializeInvoice(i, { admin: false })) });
  });

  // ── Admin ────────────────────────────────────────────────────

  app.get("/api/admin/invoices/stats", requireAdmin, async (_req: AuthedRequest, res: Response) => {
    res.json({ ...storage.getInvoiceStats(), stripeConfigured: isStripeConfigured() });
  });

  app.get("/api/admin/invoices", requireAdmin, async (req: AuthedRequest, res: Response) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const recipient = req.query.memberId ? parseInt(String(req.query.memberId), 10) : undefined;
    const overdueOnly = req.query.overdue === "true";

    const list = storage.listInvoices({
      status,
      recipientUserId: Number.isFinite(recipient!) ? recipient : undefined,
      overdueOnly,
    });

    res.json({
      invoices: list.map((i) => serializeInvoice(i, { admin: true })),
      stripeConfigured: isStripeConfigured(),
    });
  });

  app.get("/api/admin/invoices/:id", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = paramId(req.params.id);
      const invoice = storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      res.json({
        invoice: serializeInvoice(invoice, { admin: true }),
        lineItems: storage.getLineItems(id),
        reminders: storage.getReminders(id),
        events: storage.getInvoiceEvents(id),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/admin/invoices", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const input = createInvoiceSchema.parse(req.body);

      const recipient = storage.getUser(input.recipientUserId);
      if (!recipient) return res.status(400).json({ error: "Recipient not found" });
      const profile = storage.getProfile(input.recipientUserId);

      const dueDate = parseDueDate(input.dueDate);
      if (dueDate <= new Date()) {
        return res.status(400).json({ error: "Due date must be in the future" });
      }

      const steps = resolveReminderSteps(input);

      const invoice = storage.createInvoice({
        publicId: storage.nextInvoicePublicId(),
        issuerUserId: null, // FVC is the issuer for now
        recipientUserId: input.recipientUserId,
        recipientEmail: recipient.email,
        recipientName: profile?.displayName || recipient.handle,
        productionId: input.productionId ?? null,
        status: "draft",
        dueDate,
        memo: input.memo ?? null,
        internalNote: input.internalNote ?? null,
        remindersEnabled: input.remindersEnabled,
        reminderProfile: JSON.stringify(steps),
        createdBy: req.userId!,
      });

      // Amounts are always recomputed server-side. A client-supplied total is
      // never trusted, on any endpoint.
      input.lineItems.forEach((li, index) => {
        storage.addLineItem({
          invoiceId: invoice.id,
          description: li.description,
          quantity: li.quantity,
          unitAmountCents: li.unitAmountCents,
          amountCents: li.quantity * li.unitAmountCents,
          position: index,
        });
      });

      const withTotals = storage.recalcInvoiceTotals(invoice.id)!;

      storage.logInvoiceEvent({
        invoiceId: invoice.id,
        eventType: "created",
        source: "admin",
        actorId: req.userId!,
        payload: JSON.stringify({ lineItemCount: input.lineItems.length }),
      });

      res.status(201).json({
        invoice: serializeInvoice(withTotals, { admin: true }),
        lineItems: storage.getLineItems(invoice.id),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch("/api/admin/invoices/:id", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = paramId(req.params.id);
      const invoice = storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      // Stripe makes amounts immutable after finalization for tax-compliance
      // reasons, so we mirror that: once sent, an invoice is a record, not a form.
      if (invoice.status !== "draft") {
        return res.status(409).json({ error: `Only drafts can be edited (this one is ${invoice.status})` });
      }

      const input = updateInvoiceSchema.parse(req.body);
      const patch: Record<string, unknown> = {};

      if (input.dueDate !== undefined) {
        const dueDate = parseDueDate(input.dueDate);
        if (dueDate <= new Date()) {
          return res.status(400).json({ error: "Due date must be in the future" });
        }
        patch.dueDate = dueDate;
      }
      if (input.memo !== undefined) patch.memo = input.memo;
      if (input.internalNote !== undefined) patch.internalNote = input.internalNote;
      if (input.productionId !== undefined) patch.productionId = input.productionId;
      if (input.remindersEnabled !== undefined) patch.remindersEnabled = input.remindersEnabled;
      if (input.reminderProfileName !== undefined) {
        patch.reminderProfile = JSON.stringify(resolveReminderSteps(input));
      }

      if (input.lineItems) {
        for (const existing of storage.getLineItems(id)) {
          storage.deleteLineItem(id, existing.id);
        }
        input.lineItems.forEach((li, index) => {
          storage.addLineItem({
            invoiceId: id,
            description: li.description,
            quantity: li.quantity,
            unitAmountCents: li.unitAmountCents,
            amountCents: li.quantity * li.unitAmountCents,
            position: index,
          });
        });
      }

      storage.updateInvoice(id, patch);
      const updated = storage.recalcInvoiceTotals(id)!;

      res.json({
        invoice: serializeInvoice(updated, { admin: true }),
        lineItems: storage.getLineItems(id),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete("/api/admin/invoices/:id", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = paramId(req.params.id);
      const invoice = storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      if (invoice.status !== "draft") {
        return res.status(409).json({ error: "Only drafts can be deleted. Void a sent invoice instead." });
      }
      storage.deleteInvoice(id);
      res.json({ success: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/admin/invoices/:id/send", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({ error: "Stripe is not configured on this environment" });
      }
      const id = paramId(req.params.id);
      const result = await sendInvoice(id, req.userId!);
      res.json({
        invoice: serializeInvoice(result.invoice, { admin: true }),
        hostedInvoiceUrl: result.hostedInvoiceUrl,
        remindersScheduled: result.remindersScheduled,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/admin/invoices/:id/void", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const invoice = await voidInvoice(paramId(req.params.id), req.userId!);
      res.json({ invoice: serializeInvoice(invoice, { admin: true }) });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/admin/invoices/:id/mark-paid", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const invoice = await markInvoicePaidOutOfBand(paramId(req.params.id), req.userId!);
      res.json({ invoice: serializeInvoice(invoice, { admin: true }) });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/admin/invoices/:id/remind", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = paramId(req.params.id);
      const tone = z.enum(REMINDER_TONES).parse(req.body?.tone ?? "neutral");
      await sendManualReminder(id, tone, req.userId!);
      res.json({ success: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch("/api/admin/invoices/:id/reminders", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = paramId(req.params.id);
      const invoice = storage.getInvoice(id);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });

      const input = z
        .object({
          remindersEnabled: z.boolean().optional(),
          reminderProfileName: z.enum(["standard", "gentle", "none", "custom"]).optional(),
          reminderSteps: z.array(reminderStepSchema).max(20).optional(),
        })
        .parse(req.body);

      const patch: Record<string, unknown> = {};
      if (input.remindersEnabled !== undefined) patch.remindersEnabled = input.remindersEnabled;
      if (input.reminderProfileName !== undefined) {
        patch.reminderProfile = JSON.stringify(resolveReminderSteps(input));
      }
      storage.updateInvoice(id, patch);

      // Re-arm from the new profile. Drop the pending queue first so removing a
      // step actually removes it rather than leaving an orphan scheduled email.
      if (input.reminderProfileName !== undefined) {
        storage.deletePendingReminders(id);
        if (storage.getInvoice(id)!.status === "open") {
          scheduleReminders(id);
        }
      }

      if (input.remindersEnabled === false) {
        storage.cancelPendingReminders(id);
      }

      res.json({
        invoice: serializeInvoice(storage.getInvoice(id)!, { admin: true }),
        reminders: storage.getReminders(id),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/admin/invoices/:id/sync", requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const invoice = await refreshInvoiceFromStripe(paramId(req.params.id));
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      res.json({ invoice: serializeInvoice(invoice, { admin: true }) });
    } catch (err) {
      handleError(res, err);
    }
  });
}
