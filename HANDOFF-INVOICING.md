# Invoicing → Claude Code handoff

Everything is written and passing on branch `feature/invoicing`. What's left is
committing, deploying, and doing a real end-to-end pass with Stripe.

**Status:** `npm run check` clean · `npm run build` succeeds · 119/119 tests pass
(28 new) · server boots, migration creates the tables, dunning job registers,
endpoints reject unauthenticated calls.

**Not done:** never run against a real Stripe account. No live invoice has been
sent, paid, or reminded. That's step 3 below.

---

## Step 1 — Commit

A git process was holding `.git/index.lock` when the work finished, so nothing
is committed yet. Clear it and check nothing else is mid-flight:

```bash
cd ~/Documents/THEFVC_CLAUDE/thefvc-local
rm -f .git/index.lock
git status
```

**Careful:** `05c544d` ("Make member profiles public at clean, path-based URLs")
landed from a parallel session while this work was in progress and swept
`client/src/App.tsx` — which included the invoicing route wiring — into that
commit. The code is correct and present; just don't be confused when the route
registration isn't in the invoicing commit.

Stage only the invoicing files. Do **not** `git add -A`:

```bash
git add \
  .env.example CLAUDE.md INVOICING.md HANDOFF-INVOICING.md \
  shared/schema.ts \
  server/migrate.ts server/storage.ts server/routes.ts server/index.ts \
  server/invoice-routes.ts \
  server/lib/invoicing.ts server/lib/stripe-client.ts server/lib/stripe.ts \
  server/jobs/dunning.ts server/jobs/scheduler.ts \
  server/email/index.ts server/email/templates.ts \
  client/src/pages/admin-invoices.tsx \
  client/src/pages/layout.tsx client/src/pages/payments.tsx \
  tests/api/invoicing.test.ts

git commit -m "Add invoicing: Stripe-backed invoices linked to member profiles

Admin-issued invoices tied to existing members. Stripe owns payment state and
hosts the pay page + PDF; FVC owns member linkage, internal notes, and the
per-invoice follow-up schedule.

Drafts never touch Stripe until Send, which keeps abandoned drafts out of the
Stripe account and makes editing free.

Follow-ups are ours rather than Stripe's because Stripe's reminder engine is
account-level only and can't do per-invoice cadence. The dunning worker
re-verifies each invoice against Stripe before every send, so a dropped
invoice.paid webhook can't result in a paid member being chased for a month.

Also adds webhook event dedupe (Stripe redelivers for up to 3 days) and
redacts pay links and PII from the response logger."

git push -u origin feature/invoicing
```

`client/src/main.tsx`, `client/src/pages/public-profile.tsx` and
`package-lock.json` are unrelated in-flight changes. Leave them.

---

## Step 2 — Stripe account

You don't have one yet. `INVOICING.md` Parts 1–3 walk through it: register,
stay in **test mode**, grab `sk_test_` / `pk_test_`, and — the step people skip —
**turn OFF** "Send reminders if a recurring invoice hasn't been paid" in
Settings → Billing → Subscriptions and emails.

Roughly ten minutes, no business verification needed for test mode.

---

## Step 3 — Deploy and verify

`INVOICING.md` Parts 4–5. Summary:

1. Point Railway at `feature/invoicing` (or merge to `main` first). The
   migration is additive and idempotent — safe against the production DB, no
   downtime.
2. Register the webhook at `https://<railway-domain>/api/stripe/webhook` for
   these six events:
   `invoice.finalized`, `invoice.sent`, `invoice.paid`,
   `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`
3. Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `INVOICE_REPLY_TO`, `RESEND_API_KEY`, `FROM_EMAIL`
4. Send yourself an invoice, pay it with `4242 4242 4242 4242`

**The one assertion that matters:** after payment, open the invoice detail and
confirm every pending reminder reads `cancelled`. Everything else failing is an
inconvenience. Reminders surviving a payment means emailing a member a demand
for money they've already paid.

---

## Kickoff prompt for Claude Code

Paste this to pick up where things left off:

> I'm continuing work on the invoicing feature in this repo. Read `CLAUDE.md`,
> `INVOICING.md`, and `HANDOFF-INVOICING.md` first.
>
> The feature is built and tested on branch `feature/invoicing` but has never
> run against a real Stripe account. I've now created a Stripe sandbox and set
> the keys in Railway.
>
> Help me get it verified end to end. Start by running `npm run check` and
> `npm test` to confirm the branch is still green, then walk me through the
> test plan in `INVOICING.md` Part 5 — especially the missed-webhook case,
> where I pay an invoice in the Stripe Dashboard, suppress the webhook,
> backdate a reminder, and confirm the dunning pass marks it `skipped` rather
> than sending.

---

## Known gaps, in the order I'd fix them

1. **Pre-existing bug, not mine to silently fix.** In `server/lib/stripe.ts`,
   the `checkout.session.completed` handler does
   `Math.round((session.amount_total || 0) / 100)` when writing to
   `payments.amount` — a column documented as cents. Subscription payments are
   being recorded at 1/100th of their real value. Independent of invoicing, but
   worth fixing before the payments table informs anything financial.

2. **No E2E coverage.** The 28 new tests are unit + service level. A Playwright
   spec covering create → send → pay → reminders-cancelled would be the highest
   value addition, but it needs Stripe test-mode fixtures.

3. **Reminder cadence isn't editable per-step in the UI.** The API supports a
   `custom` profile with arbitrary offsets; the create dialog only exposes
   Standard / Gentle / None. Wire the custom editor when you actually want it.

4. **Single-worker constraint is unenforced.** If Railway ever scales past one
   replica, every replica sends every reminder. Add a lock row to
   `runDunningPass` before scaling, or move the job to its own service.

5. **Member-to-member invoicing** is schema-ready (`invoices.issuer_user_id`)
   but is a separate project — routing money *to* members means Connect
   onboarding, KYC, platform fees, 1099s, and disputes.
