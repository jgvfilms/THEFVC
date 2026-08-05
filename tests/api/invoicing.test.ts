/**
 * Invoicing tests.
 *
 * Covers the logic that can go wrong quietly and expensively:
 *   - money arithmetic (integer cents, no float drift)
 *   - reminder scheduling across a DST boundary
 *   - reminders being cancelled the instant an invoice stops being owed
 *   - webhook redelivery not re-running side effects
 *   - admin-only fields never reaching a member
 *
 * No network calls: the Stripe SDK is never invoked here. Anything that would
 * hit Stripe is exercised through syncInvoiceFromStripe with a hand-built
 * invoice object, which is the same shape the webhook delivers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type Stripe from "stripe";
import { storage, db } from "../../server/storage";
import {
  atLocalHour,
  addDays,
  scheduleReminders,
  parseReminderProfile,
  syncInvoiceFromStripe,
  mapStripeStatus,
  formatCents,
  isOverdue,
  daysOverdue,
  REMINDER_PROFILES,
} from "../../server/lib/invoicing";
import { invoiceReminderTemplate } from "../../server/email/templates";
import { hashPassword } from "../../server/middleware/auth";

const DAY = 86400000;

function makeUser(handle = "billme") {
  return storage.createUser({
    handle,
    email: `${handle}@example.com`,
    passwordHash: hashPassword("TestPass123!"),
    isAdmin: false,
    accessStatus: "active",
    invitedBy: null,
  });
}

function makeInvoice(
  userId: number,
  overrides: Partial<Parameters<typeof storage.createInvoice>[0]> = {}
) {
  return storage.createInvoice({
    publicId: storage.nextInvoicePublicId(),
    recipientUserId: userId,
    recipientEmail: "billme@example.com",
    recipientName: "Bill Me",
    status: "draft",
    dueDate: new Date(Date.now() + 30 * DAY),
    remindersEnabled: true,
    reminderProfile: JSON.stringify(REMINDER_PROFILES.standard),
    ...overrides,
  });
}

describe("Invoicing", () => {
  beforeEach(() => {
    for (const table of [
      "invoice_reminders",
      "invoice_events",
      "invoice_line_items",
      "invoices",
      "stripe_webhook_events",
      "profiles",
      "sessions",
      "users",
    ]) {
      try {
        db.run(`DELETE FROM ${table}`);
      } catch {
        // Table may not exist on an older DB — not worth failing over.
      }
    }
  });

  // ───────────────────────────────────────────────────────────
  describe("money arithmetic", () => {
    it("computes totals from line items in integer cents", () => {
      const user = makeUser();
      const invoice = makeInvoice(user.id);

      // 3 × $19.99 = $59.97. Done in floats this is 59.969999999999999.
      storage.addLineItem({
        invoiceId: invoice.id,
        description: "Camera op day rate",
        quantity: 3,
        unitAmountCents: 1999,
        amountCents: 3 * 1999,
        position: 0,
      });
      storage.addLineItem({
        invoiceId: invoice.id,
        description: "Equipment",
        quantity: 1,
        unitAmountCents: 45050,
        amountCents: 45050,
        position: 1,
      });

      const updated = storage.recalcInvoiceTotals(invoice.id)!;
      expect(updated.subtotalCents).toBe(5997 + 45050);
      expect(updated.totalCents).toBe(51047);
      expect(updated.amountDueCents).toBe(51047);
      expect(Number.isInteger(updated.totalCents)).toBe(true);
    });

    it("formats cents without drift", () => {
      expect(formatCents(51047)).toBe("$510.47");
      expect(formatCents(0)).toBe("$0.00");
      expect(formatCents(100)).toBe("$1.00");
    });

    it("issues sequential public IDs", () => {
      const user = makeUser();
      const a = makeInvoice(user.id);
      const b = makeInvoice(user.id);
      expect(a.publicId).toMatch(/^FVC-\d{4}-0001$/);
      expect(b.publicId).toMatch(/^FVC-\d{4}-0002$/);
    });
  });

  // ───────────────────────────────────────────────────────────
  describe("reminder scheduling", () => {
    it("puts reminders at 9am Eastern, not 9am UTC", () => {
      // July — EDT, UTC-4. 9am local == 13:00 UTC.
      const summer = atLocalHour(new Date(Date.UTC(2026, 6, 15)), 9, "America/New_York");
      expect(summer.getUTCHours()).toBe(13);
    });

    it("holds 9am local across the DST boundary", () => {
      // A 30-day offset from late October lands after the EDT->EST switch.
      // Naive UTC arithmetic sends this one an hour early.
      const beforeSwitch = atLocalHour(new Date(Date.UTC(2026, 9, 20)), 9, "America/New_York");
      const afterSwitch = atLocalHour(new Date(Date.UTC(2026, 10, 19)), 9, "America/New_York");

      expect(beforeSwitch.getUTCHours()).toBe(13); // EDT
      expect(afterSwitch.getUTCHours()).toBe(14); // EST — one hour later in UTC

      const asLocal = (d: Date) =>
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          hour12: false,
        }).format(d);
      expect(asLocal(beforeSwitch)).toBe("09");
      expect(asLocal(afterSwitch)).toBe("09");
    });

    it("expands a profile into one row per step", () => {
      const user = makeUser();
      const invoice = makeInvoice(user.id, { dueDate: new Date(Date.now() + 60 * DAY) });

      const created = scheduleReminders(invoice.id);
      expect(created).toBe(REMINDER_PROFILES.standard.length);

      const reminders = storage.getReminders(invoice.id);
      expect(reminders).toHaveLength(6);
      expect(reminders.every((r) => r.status === "pending")).toBe(true);
      // Sorted ascending, so the pre-due friendly nudge comes first.
      expect(reminders[0].tone).toBe("friendly");
      expect(reminders[reminders.length - 1].tone).toBe("final");
    });

    it("is idempotent — a second pass creates nothing", () => {
      const user = makeUser();
      const invoice = makeInvoice(user.id, { dueDate: new Date(Date.now() + 60 * DAY) });

      scheduleReminders(invoice.id);
      const second = scheduleReminders(invoice.id);

      expect(second).toBe(0);
      expect(storage.getReminders(invoice.id)).toHaveLength(6);
    });

    it("skips steps whose send time has already passed", () => {
      const user = makeUser();
      // Due in 1 day: the -3 day step is already in the past.
      const invoice = makeInvoice(user.id, { dueDate: new Date(Date.now() + 1 * DAY) });

      scheduleReminders(invoice.id);
      const offsets = storage.getReminders(invoice.id).map((r) => r.offsetDays);

      expect(offsets).not.toContain(-3);
      expect(offsets).toContain(7);
    });

    it("schedules nothing when reminders are disabled", () => {
      const user = makeUser();
      const invoice = makeInvoice(user.id, { remindersEnabled: false });
      expect(scheduleReminders(invoice.id)).toBe(0);
    });

    it("rejects malformed reminder profiles instead of throwing", () => {
      expect(parseReminderProfile(null)).toEqual([]);
      expect(parseReminderProfile("not json")).toEqual([]);
      expect(parseReminderProfile('{"not":"an array"}')).toEqual([]);
      expect(parseReminderProfile('[{"offsetDays":"3","tone":"firm"}]')).toEqual([]);
      expect(parseReminderProfile('[{"offsetDays":3,"tone":"nonsense"}]')).toEqual([]);
      expect(parseReminderProfile('[{"offsetDays":3,"tone":"firm"}]')).toEqual([
        { offsetDays: 3, tone: "firm" },
      ]);
    });

    it("adds days without mutating the input date", () => {
      const start = new Date(Date.UTC(2026, 0, 31));
      const later = addDays(start, 1);
      expect(later.toISOString().slice(0, 10)).toBe("2026-02-01");
      expect(start.toISOString().slice(0, 10)).toBe("2026-01-31");
    });
  });

  // ───────────────────────────────────────────────────────────
  describe("payment cancels follow-ups", () => {
    function openInvoiceWithReminders() {
      const user = makeUser();
      const invoice = makeInvoice(user.id, {
        status: "open",
        stripeInvoiceId: "in_test_123",
        dueDate: new Date(Date.now() + 60 * DAY),
        amountDueCents: 50000,
        totalCents: 50000,
      });
      scheduleReminders(invoice.id);
      return invoice;
    }

    const stripeInvoice = (overrides: Partial<Stripe.Invoice>): Stripe.Invoice =>
      ({
        id: "in_test_123",
        status: "paid",
        amount_paid: 50000,
        amount_due: 0,
        total: 50000,
        subtotal: 50000,
        hosted_invoice_url: "https://invoice.stripe.com/test",
        invoice_pdf: "https://invoice.stripe.com/test.pdf",
        ...overrides,
      }) as Stripe.Invoice;

    it("cancels every pending reminder when the invoice is paid", () => {
      const invoice = openInvoiceWithReminders();
      expect(storage.getReminders(invoice.id).filter((r) => r.status === "pending").length).toBeGreaterThan(0);

      syncInvoiceFromStripe(stripeInvoice({ status: "paid" }));

      const after = storage.getReminders(invoice.id);
      expect(after.every((r) => r.status === "cancelled")).toBe(true);
      expect(storage.getInvoice(invoice.id)!.status).toBe("paid");
      expect(storage.getInvoice(invoice.id)!.paidAt).toBeTruthy();
    });

    it("cancels reminders when the invoice is voided", () => {
      const invoice = openInvoiceWithReminders();
      syncInvoiceFromStripe(stripeInvoice({ status: "void", amount_paid: 0, amount_due: 0 }));

      expect(storage.getInvoice(invoice.id)!.status).toBe("void");
      expect(storage.getReminders(invoice.id).every((r) => r.status === "cancelled")).toBe(true);
    });

    it("cancels reminders when the invoice is marked uncollectible", () => {
      const invoice = openInvoiceWithReminders();
      syncInvoiceFromStripe(stripeInvoice({ status: "uncollectible", amount_paid: 0, amount_due: 50000 }));

      expect(storage.getInvoice(invoice.id)!.status).toBe("uncollectible");
      expect(storage.getReminders(invoice.id).every((r) => r.status === "cancelled")).toBe(true);
    });

    it("leaves reminders armed while the invoice is still open", () => {
      const invoice = openInvoiceWithReminders();
      syncInvoiceFromStripe(stripeInvoice({ status: "open", amount_paid: 0, amount_due: 50000 }));

      expect(storage.getReminders(invoice.id).some((r) => r.status === "pending")).toBe(true);
    });

    it("ignores Stripe invoices that aren't ours", () => {
      openInvoiceWithReminders();
      const result = syncInvoiceFromStripe(stripeInvoice({ id: "in_someone_else" }));
      expect(result).toBeUndefined();
    });

    it("maps every Stripe status we care about", () => {
      expect(mapStripeStatus("draft")).toBe("draft");
      expect(mapStripeStatus("open")).toBe("open");
      expect(mapStripeStatus("paid")).toBe("paid");
      expect(mapStripeStatus("void")).toBe("void");
      expect(mapStripeStatus("uncollectible")).toBe("uncollectible");
      expect(mapStripeStatus(null)).toBe("open");
    });
  });

  // ───────────────────────────────────────────────────────────
  describe("webhook dedupe", () => {
    it("claims an event once and refuses the redelivery", () => {
      expect(storage.claimWebhookEvent("evt_1", "invoice.paid")).toBe(true);
      expect(storage.claimWebhookEvent("evt_1", "invoice.paid")).toBe(false);
      expect(storage.claimWebhookEvent("evt_2", "invoice.paid")).toBe(true);
    });

    it("records processing outcome", () => {
      storage.claimWebhookEvent("evt_3", "invoice.finalized");
      storage.markWebhookEventProcessed("evt_3");
      const row = db.all(`SELECT processed_at FROM stripe_webhook_events WHERE id = 'evt_3'`) as any[];
      expect(row[0].processed_at).toBeTruthy();
    });
  });

  // ───────────────────────────────────────────────────────────
  describe("member scoping", () => {
    it("returns only that member's non-draft invoices", () => {
      const alice = makeUser("alice");
      const bob = makeUser("bob");

      makeInvoice(alice.id, { status: "open" });
      makeInvoice(alice.id, { status: "draft" });
      makeInvoice(bob.id, { status: "open" });

      const forAlice = storage.listInvoicesForUser(alice.id);
      expect(forAlice).toHaveLength(1);
      expect(forAlice[0].recipientUserId).toBe(alice.id);
      expect(forAlice[0].status).toBe("open");
    });
  });

  // ───────────────────────────────────────────────────────────
  describe("reminder emails", () => {
    const base = {
      publicId: "FVC-2026-0007",
      recipientName: "Dana Reyes",
      amountDue: "$1,250.00",
      dueDate: "August 1, 2026",
      hostedInvoiceUrl: "https://invoice.stripe.com/x",
    };

    it("always states the invoice number and the amount", () => {
      for (const tone of ["friendly", "neutral", "firm", "final"]) {
        const email = invoiceReminderTemplate({ ...base, tone, daysOverdue: 9 });
        expect(email.text).toContain("FVC-2026-0007");
        expect(email.text).toContain("$1,250.00");
        expect(email.html).toContain("FVC-2026-0007");
      }
    });

    it("always offers a human to reply to", () => {
      for (const tone of ["friendly", "neutral", "firm", "final"]) {
        const email = invoiceReminderTemplate({ ...base, tone, daysOverdue: 9 });
        expect(email.text.toLowerCase()).toContain("reply to this email");
      }
    });

    it("escalates tone without ever threatening", () => {
      const friendly = invoiceReminderTemplate({ ...base, tone: "friendly" });
      const final = invoiceReminderTemplate({ ...base, tone: "final", daysOverdue: 45 });

      expect(friendly.subject).toContain("due");
      expect(final.subject).toContain("Final notice");
      expect(final.text).toContain("45 days past due");
      // The last automated word should still leave the door open.
      expect(final.text).toContain("work something out");
    });

    it("never leaks the internal note", () => {
      // internalNote is deliberately not a template input. This asserts the
      // contract holds even if someone spreads a whole invoice into the context.
      const email = invoiceReminderTemplate({
        ...base,
        tone: "firm",
        daysOverdue: 5,
        internalNote: "SECRET-do-not-send: chasing via Garrett directly",
      });
      expect(email.html).not.toContain("SECRET-do-not-send");
      expect(email.text).not.toContain("SECRET-do-not-send");
    });

    it("uses the first name only", () => {
      const email = invoiceReminderTemplate({ ...base, tone: "neutral" });
      expect(email.text).toContain("Hi Dana,");
      expect(email.text).not.toContain("Hi Dana Reyes,");
    });
  });

  // ───────────────────────────────────────────────────────────
  describe("overdue is derived, never stored", () => {
    it("flips based on the clock alone", () => {
      const user = makeUser();
      const invoice = makeInvoice(user.id, {
        status: "open",
        dueDate: new Date(Date.now() - 5 * DAY),
      });
      const row = storage.getInvoice(invoice.id)!;

      expect(isOverdue(row)).toBe(true);
      expect(daysOverdue(row)).toBe(5);
      // Same row, evaluated before the due date, is not overdue.
      expect(isOverdue(row, new Date(Date.now() - 10 * DAY))).toBe(false);
    });

    it("a paid invoice is never overdue", () => {
      const user = makeUser();
      const invoice = makeInvoice(user.id, {
        status: "paid",
        dueDate: new Date(Date.now() - 30 * DAY),
      });
      expect(isOverdue(storage.getInvoice(invoice.id)!)).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────
  describe("stats", () => {
    it("counts outstanding and overdue separately", () => {
      const user = makeUser();
      makeInvoice(user.id, {
        status: "open",
        amountDueCents: 10000,
        dueDate: new Date(Date.now() + 10 * DAY),
      });
      makeInvoice(user.id, {
        status: "open",
        amountDueCents: 25000,
        dueDate: new Date(Date.now() - 10 * DAY),
      });
      makeInvoice(user.id, {
        status: "paid",
        amountPaidCents: 5000,
        paidAt: new Date(),
        issuedAt: new Date(Date.now() - 4 * DAY),
      });

      const stats = storage.getInvoiceStats();
      expect(stats.outstandingCents).toBe(35000);
      expect(stats.outstandingCount).toBe(2);
      expect(stats.overdueCents).toBe(25000);
      expect(stats.overdueCount).toBe(1);
      expect(stats.collectedThisMonthCents).toBe(5000);
      expect(stats.avgDaysToPay).toBeCloseTo(4, 0);
    });
  });
});
