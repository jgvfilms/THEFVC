# Invoicing — setup and testing guide

Admin-issued invoices linked to member profiles, paid through Stripe, with
automatic follow-ups on a per-invoice schedule.

Companion to `DEPLOY.md`. Everything below assumes the Railway deploy from that
doc is already working.

---

## How it fits together

| Concern | Owner |
|---|---|
| Payment status, amounts paid | **Stripe** — mirrored into `invoices`, never authored locally |
| Member linkage, production, internal notes, follow-up schedule | **FVC** |
| Invoice PDF + hosted pay page | **Stripe** — free, tax-compliant, mobile-friendly |
| First "here's your invoice" email | **Stripe** (`POST /v1/invoices/:id/send`, PDF attached) |
| Every follow-up after that | **FVC** — Stripe's reminders are account-level only |

Local drafts never touch Stripe. An invoice lives entirely in `data.db` until
someone presses **Send**, which is what makes editing free and keeps abandoned
drafts out of the Stripe account.

---

## Part 1 — Create the Stripe account

You don't have one yet, so start here. Everything in this section is free and
takes about ten minutes.

1. Go to **https://dashboard.stripe.com/register**. Sign up with an email you
   control long-term — this becomes the owner account for all FVC money.
2. Set the business name to **The Film Video Collective**. You can complete the
   full business/tax details later; you do **not** need them to test.
3. You'll land in the Dashboard. Look for the **Sandbox** / **Test mode**
   toggle in the top-right and make sure it's ON. Test mode is a completely
   separate world — separate keys, separate invoices, no real money, and you
   can create as many as you like.

> **Do all of Part 2–5 in test mode.** Live mode requires business verification
> and bank details, and there's no reason to touch it until the flow works.

---

## Part 2 — Get the keys

**Dashboard → Developers → API keys** (with test mode ON):

| Dashboard label | Env var | Looks like |
|---|---|---|
| Publishable key | `STRIPE_PUBLISHABLE_KEY` | `pk_test_51...` |
| Secret key (click *Reveal*) | `STRIPE_SECRET_KEY` | `sk_test_51...` |

The secret key is a credential. It goes in Railway's **Variables** tab and
nowhere else — not in the repo, not in a commit, not in a screenshot.

The app checks that `STRIPE_SECRET_KEY` starts with `sk_`. If it doesn't, the
admin UI shows a banner and the Send button stays disabled rather than failing
at the last second.

---

## Part 3 — Turn OFF Stripe's own reminders

**This is the step that matters most, and it's counterintuitive.**

Go to **Settings → Billing → Subscriptions and emails**:

| Setting | Set to | Why |
|---|---|---|
| Send reminders if a recurring invoice hasn't been paid | **OFF** | Stripe's reminder engine is account-level only — one schedule for every invoice. It can't do per-invoice cadence, which is the whole point of this feature. Leaving it on means every member gets nagged twice, by two systems, on two different schedules. |
| Send finalized invoices and credit notes to customers | **ON** | This is the initial send. Stripe attaches the PDF; there's no reason to rebuild that. |
| Send emails when card payments fail | Your call | FVC's follow-up ladder continues regardless of a failed attempt, so this is optional. |

Also worth setting now: **Settings → Business → Branding**. Upload the FVC logo
and set the accent colour. It appears on the hosted pay page and the PDF, and
it's the difference between an invoice that looks like it came from a company
and one that looks like it came from a Stripe test account.

---

## Part 4 — Deploy and wire the webhook

The webhook is how FVC learns that an invoice was paid. Without it, statuses go
stale and — critically — the follow-up emails keep going out to people who have
already paid.

### 4a. Deploy the branch

```bash
git push -u origin feature/invoicing
```

Point the Railway service at the branch (or merge to `main` first). The
migration is idempotent and additive — it only runs `CREATE TABLE IF NOT
EXISTS` and adds indexes, so it's safe against the existing production DB and
requires no downtime.

### 4b. Register the endpoint

**Dashboard → Developers → Webhooks → Add endpoint**

- **Endpoint URL**: `https://<your-railway-domain>/api/stripe/webhook`
- **Events to send** — select these six:

```
invoice.finalized
invoice.sent
invoice.paid
invoice.payment_failed
invoice.voided
invoice.marked_uncollectible
```

Save, then click **Reveal** under *Signing secret*. That's `whsec_...`.

### 4c. Set the remaining variables

In Railway → **Variables**:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
INVOICE_REPLY_TO=garrett@thefvc.is
RESEND_API_KEY=re_...
FROM_EMAIL=billing@thefvc.is
```

`INVOICE_REPLY_TO` must reach a real person. Every follow-up email tells the
recipient to reply there if something looks wrong, and that escape hatch is the
main thing standing between an automated reminder and an annoyed member.

Without `RESEND_API_KEY` the app still boots fine, but follow-up emails fail
individually — the initial invoice email still goes out, because Stripe sends
that one.

---

## Part 5 — Test it end to end

### The happy path

1. Log in as admin → sidebar → **Invoices** → **New invoice**
2. Pick a member from the dropdown (name and email come from their profile)
3. Add a line item, e.g. `Camera op — 2 days` × 1 @ `1200.00`
4. Due date: a week or two out
5. Follow-ups: **Standard**. The dialog shows you the exact dates the member
   will be emailed — check they look sane before sending
6. **Save draft** → confirm the total → **Send**

You should see a toast confirming how many follow-ups were armed.

7. Open the invoice, click **Pay page**, and pay with the Stripe test card:

```
Card    4242 4242 4242 4242
Expiry  any future date
CVC     any 3 digits
ZIP     any 5 digits
```

8. Back in the admin list, hit refresh. Status should be **Paid**, and on the
   detail view **every pending reminder should read `cancelled`**.

That last check is the one to actually verify. Everything else failing is an
inconvenience; reminders surviving a payment means emailing a member a demand
for money they've already paid.

### Cases worth exercising

| Scenario | How | Expected |
|---|---|---|
| Failed payment | Pay with `4000 0000 0000 0341` | Stays **Sent**, reminders stay pending, `payment_failed` in the timeline |
| Check / cash payment | **Mark paid** on an open invoice | Goes to **Paid**, reminders cancelled (routed through Stripe as `paid_out_of_band`, so it uses the same path as a card payment) |
| Voided invoice | **Void** button | Goes to **Void**, reminders cancelled |
| Reminder fires | See below | One email, reminder flips to `sent` |
| Member can't see drafts | Log in as the member → Billing tab | Only sent invoices appear |
| Double-click Send | Click it twice fast | Exactly one invoice in the Stripe Dashboard (idempotency keys) |

### Forcing a reminder without waiting

The worker runs every 15 minutes and only picks up reminders whose time has
come. To test one now, backdate it directly:

```bash
# On the Railway shell, or locally against a dev DB
sqlite3 $DATABASE_PATH \
  "UPDATE invoice_reminders SET send_at = strftime('%s','now')*1000 - 60000
   WHERE invoice_id = <id> AND status = 'pending'
   ORDER BY send_at LIMIT 1;"
```

Then wait for the next 15-minute tick, or restart the service to trigger a pass.

**The test actually worth running:** pay the invoice in the Stripe Dashboard,
then — before the webhook is processed — backdate a reminder and run a pass.
The reminder should come back `skipped`, not `sent`. That's the safety net for
a missed webhook, and it's the one piece of this system whose failure is
visible to a member.

### Watching webhooks

**Dashboard → Developers → Webhooks → your endpoint** shows every delivery with
its response. A 400 means the signing secret is wrong. Redeliveries are handled
— the `stripe_webhook_events` table rejects an event ID it has already claimed,
so Stripe's retries can't double-apply anything.

---

## Going live

When you're ready for real money:

1. Complete business verification in the Dashboard (legal entity, EIN, bank
   account for payouts)
2. Flip out of test mode and pull the **live** keys (`sk_live_`, `pk_live_`)
3. **Create a second webhook endpoint in live mode** — signing secrets are
   per-mode, and the test one won't work. This is the single most common
   go-live mistake
4. Re-check the reminder settings from Part 3; they're per-mode too
5. Update the Railway variables, redeploy
6. Send one small real invoice to yourself and pay it before sending any to
   members

**Costs:** Stripe Invoicing Starter is 0.4% of each paid invoice, plus standard
processing (2.9% + 30¢ for cards). ACH is substantially cheaper and worth
enabling for larger production invoices — on a $2,000 invoice that's the
difference between roughly $58 and a few dollars. Verify current rates at
https://stripe.com/invoicing/pricing.

---

## Operational notes

**Single worker only.** The dunning job runs in-process via `node-cron`. If the
Railway service is ever scaled past one replica, every replica sends the same
reminder. Before scaling, either move the job to a dedicated single-replica
service or add a lock row to the pass.

**Reminders send at 9am Eastern**, not 9am UTC — including across the DST
boundary, which is exactly where a 30-day offset from late October lands.
There's a test for it.

**Overdue is computed, never stored.** A stored `is_overdue` flag goes stale the
moment a due date passes without the job running, so it's derived at read time
from `status = 'open' AND due_date < now`.

**Amounts are integer cents everywhere.** No floats touch money, in the DB or in
the UI's dollar-to-cents conversion.

**Pay links are treated as credentials.** `hosted_invoice_url` lets anyone
holding it view and pay the invoice, so it's redacted from application logs
alongside secrets and PII, and only ever returned to an admin or the invoice's
own recipient.

**Internal notes never leave the admin.** `internalNote` is stripped from every
non-admin API response and is not a parameter of the email template. There's a
test asserting it can't leak even if someone spreads a whole invoice object into
the template context.

---

## Files

| Path | What it does |
|---|---|
| `shared/schema.ts` | `invoices`, `invoice_line_items`, `invoice_reminders`, `invoice_events`, `stripe_webhook_events` |
| `server/migrate.ts` | Idempotent table + index creation |
| `server/lib/stripe-client.ts` | Pinned Stripe client (isolated to break an import cycle) |
| `server/lib/invoicing.ts` | Send flow, void, mark-paid, Stripe sync, reminder scheduling, timezone math |
| `server/lib/stripe.ts` | Webhook routing + dedupe |
| `server/jobs/dunning.ts` | The follow-up worker |
| `server/email/templates.ts` | `invoiceReminderTemplate` (four tones) |
| `server/invoice-routes.ts` | Admin CRUD + member read-only endpoints |
| `client/src/pages/admin-invoices.tsx` | Admin list, create dialog, detail view |
| `client/src/pages/payments.tsx` | Member Billing tab |
| `tests/api/invoicing.test.ts` | 28 tests |

## API

```
GET    /api/me/invoices                       member's own, non-draft only

GET    /api/admin/invoices                    ?status= &memberId= &overdue=
GET    /api/admin/invoices/stats
POST   /api/admin/invoices                    create draft
GET    /api/admin/invoices/:id                + line items, reminders, timeline
PATCH  /api/admin/invoices/:id                drafts only (409 otherwise)
DELETE /api/admin/invoices/:id                drafts only
POST   /api/admin/invoices/:id/send           → Stripe, finalize, email, arm reminders
POST   /api/admin/invoices/:id/remind         send one now
POST   /api/admin/invoices/:id/void
POST   /api/admin/invoices/:id/mark-paid      out-of-band (check/cash)
PATCH  /api/admin/invoices/:id/reminders      toggle / change cadence
POST   /api/admin/invoices/:id/sync           force re-pull from Stripe

POST   /api/stripe/webhook                    signature-verified, deduped
```

---

## Later: members invoicing each other

The schema already has the hook — `invoices.issuer_user_id` is `NULL` when FVC
is billing, and non-null when a member is. Nothing here needs a rewrite.

The real work isn't the invoice model, it's that money has to route *to* the
member, which means Stripe Connect (partly built already in `lib/stripe.ts` for
PRD-019), plus issuer KYC onboarding, a platform fee decision, 1099 reporting,
and a dispute path. That's a distinct project with real compliance weight —
worth its own spec rather than an extension of this one.
