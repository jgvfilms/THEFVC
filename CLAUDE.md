# THEFVC.IS — working notes for Claude Code

Production management + community platform for indie filmmakers.
Monolith: Express API + React SPA, one process, one SQLite file.

## Commands

```bash
npm run dev          # tsx server/index.ts — API + Vite middleware on :3000
npm run build        # vite build (client) + esbuild (server) -> dist/
npm start            # node dist/index.cjs
npm run check        # tsc --noEmit — must be clean before commit
npm test             # vitest run (unit + API integration)
npm run test:e2e     # playwright
npm run db:push      # drizzle-kit push — ONLY for creating a fresh dev DB
```

## Stack

- **Server**: Express 5, better-sqlite3 (synchronous), Drizzle ORM, `node-cron` jobs in-process
- **Client**: React 18, Vite, wouter (routing), TanStack Query, Tailwind + Radix/shadcn
- **Email**: Resend, via a DB-backed queue (`email_queue`) drained by cron every 2 min
- **Payments**: Stripe — subscriptions, Connect (PRD-019), and invoicing
- **Aliases**: `@/` → `client/src/`, `@shared` → `shared/`

## Things that will bite you

**Migrations are hand-rolled and idempotent, not Drizzle-managed at runtime.**
`server/migrate.ts` runs on every boot: `PROFILE_COLUMNS`/`USER_COLUMNS` arrays
do guarded `ALTER TABLE`, `NEW_TABLES` does `CREATE TABLE IF NOT EXISTS`,
`INDEXES` does `CREATE INDEX IF NOT EXISTS`. Add new tables/columns there.
`shared/schema.ts` must be kept in sync by hand — Drizzle is the query builder,
not the migration runner. `migrations/0000_*.sql` is only the bootstrap for
fresh DBs and the test harness.

**better-sqlite3 is synchronous.** `storage.*` methods return values directly,
not promises. Don't `await` them.

**Express 5 types route params as `string | string[]`.** Narrow before parsing.
See `paramId()` in `server/invoice-routes.ts`.

**Webhook raw body.** `server/index.ts` captures `req.rawBody` in
`express.json({ verify })`. Stripe signature verification uses that — do not add
`express.raw()` middleware, and don't move the json parser.

**Stripe IDs are encrypted at rest** on `profiles` (`encryptSensitive` /
`decryptSensitive` in `server/lib/encryption.ts`). Consequence: you can't index
or `WHERE` on them, which is why `getProfileByStripeCustomerId` scans and
decrypts. Don't copy that pattern for anything hot — invoice lookups use a
plaintext `stripe_invoice_id` with a unique index precisely to avoid it.

**Money is always integer cents.** Never floats, never dollars in the DB.
There is a known bug in the pre-existing subscription handler
(`lib/stripe.ts`, `checkout.session.completed`) that divides `amount_total` by
100 before storing into a cents column. Not fixed yet — don't imitate it.

**`TRUSTED_PROXY_HOPS` must match the real proxy depth** or rate limiting fails
*silently*. Railway = `2`. See `.env.example`.

**Auth**: session token in `Authorization: Bearer`, not cookies. `requireAuth` /
`requireAdmin` from `server/middleware/auth.ts`. Read identity from
`req.userId` (session), never from a request parameter — an IDOR bug on the
crew endpoints came from exactly that.

## Tests

`tests/db-setup.ts` runs as a Vitest setupFile: it gives **each test file its
own temp SQLite DB**, bootstrapped from `migrations/0000_*.sql`, and injects a
throwaway `ENCRYPTION_KEY`. `fileParallelism` is off deliberately.

Integration tests boot the real Express app in-process (`tests/server.ts`).
`RATE_LIMIT_MAX_MULTIPLIER=100` is set there so the limiter doesn't trip
mid-suite.

Truncate tables in `beforeEach` for isolation — see the table list at the top
of `tests/api/invoicing.test.ts`.

## Invoicing

Admin-issued invoices linked to member profiles, paid via Stripe, with
automatic per-invoice follow-ups. Full setup + testing guide: **`INVOICING.md`**.

Division of responsibility: Stripe owns payment state and hosts the pay
page/PDF; FVC owns member linkage, internal notes, and the follow-up schedule.
Local drafts never touch Stripe until Send.

Non-obvious invariants, all covered by tests in `tests/api/invoicing.test.ts`:

- **Stripe's own reminder emails must stay OFF** in the Dashboard. They're
  account-level only, so they can't do per-invoice cadence, and running both
  means members get nagged twice.
- **Any terminal status cancels pending reminders** (`syncInvoiceFromStripe`).
  Chasing someone who already paid is the worst thing this feature can do.
- **The dunning worker re-verifies against Stripe before every send**, so a
  missed webhook can't cause a month of demands to a paid member.
- **Overdue is derived, never stored** — `status='open' AND due_date < now`.
- **`hosted_invoice_url` is an unauthenticated pay link.** Treat it as a
  credential: redacted from logs, only returned to an admin or the recipient.
- **`internalNote` never leaves the admin API** and is not a template input.
- **The dunning cron must run in exactly one process.** Scaling past one
  Railway replica means every replica sends the same reminder.

## Style

- Comments explain *why*, not *what*. Prefer one sentence of rationale over a
  restatement of the code.
- Match the surrounding file. Server code is plain functions + a `storage`
  class; client code is function components with TanStack Query.
- `data-testid` on anything Playwright will need.
- Run `npm run check` and `npm test` before declaring done.
