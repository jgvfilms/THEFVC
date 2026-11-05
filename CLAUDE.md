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
The subscription handler (`lib/stripe.ts`, `checkout.session.completed`) used
to divide `amount_total` by 100 before storing it; that was fixed in `1d99b95`
and is pinned by `tests/api/checkout-webhook.test.ts`. Subscription payment rows
written before 2026-11-02 may hold about 1/100th of the real amount; no migration
backfills them.

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

## Production payments (Stripe Connect)

A production owner pays a confirmed crew member, or requests money for the
production, through the **payee's own Express account** (direct charge,
Checkout Session with `stripeAccount`). The payee is merchant of record, so
disputes and refunds are theirs; FVC takes `platformFeeCents` (5%, waived when
the *payer* is Pro/Studio). Code: `lib/production-payments.ts`,
`production-payment-routes.ts`, UI `components/production-payments.tsx`.

- **Money is marked paid only by the verified Connect webhook**
  (`POST /api/stripe/connect-webhook`, its own secret
  `STRIPE_CONNECT_WEBHOOK_SECRET`; 503 when unset). The handler checks the event's
  `account` is the payee's, and the amount/currency match the row.
- **Connect readiness is `profiles.connect_charges_enabled/_payouts_enabled`**,
  set only from Stripe. It no longer touches `subscription_status`.
- **The Checkout URL is an unauthenticated pay link**: made per request, returned
  only to the production owner, never stored or logged.
- A separate **"Connected accounts"** destination must exist in the live Stripe
  Dashboard (events `account.updated`, `checkout.session.completed`); the
  platform webhook does not receive connected-account events.

## AI connections (MCP + OAuth)

Members connect their own AI (claude.ai connector, Claude Code) to read and
update *their* profile, credits and page. `server/mcp-routes.ts` is the endpoint
(`POST /mcp`, stateless, fresh `McpServer` per request); `server/oauth-routes.ts`
+ `server/lib/oauth-provider.ts` are the OAuth 2.1 server the MCP SDK's
`mcpAuthRouter` delegates to. UI: `client/src/pages/connections.tsx`,
`oauth-consent.tsx`.

Invariants (covered by `tests/api/mcp.test.ts` and `oauth.test.ts`):

- **Identity comes only from the token.** No tool takes a user id. Credit
  edit/delete check ownership and answer "not found" either way. Verified
  credits are never changed over MCP.
- **Tokens are `fvc_mcp_…`, stored as a SHA-256 hash**, shown once. A login
  session token is rejected on `/mcp`; an MCP token can't mint tokens.
- **OAuth access tokens are `mcp_tokens` rows with `kind='oauth_access'`**
  (1 h), each tied to an `oauth_grants` row, one per (member, app) connection.
  Kind is stored, never inferred from the name. `authenticateMcpToken` **fails
  closed**: a missing or revoked grant rejects the token. Revoking any of a
  grant's tokens (Connections page, `/revoke`) revokes the grant, its access
  tokens and its refresh tokens in one transaction. The refresh token rotates
  on every use; presenting an already-rotated one that is still inside its
  lifetime is treated as theft and revokes the grant, but a merely *expired*
  one does not. The Connections page lists one row per live grant, and only
  personal tokens count toward the 10-token limit.
- **Scopes default to read-only** (`profile:read`, `credits:read`) when a client
  asks for none; writes must be requested and approved.
- **`messages:read` is opt-in and read-only.** Never in the default scopes, no
  send/reply tool exists, reading over MCP does not mark messages read, and
  every read is audit-logged. An unknown member and a never-talked-to member
  get the same answer.
- **OAuth endpoint throttles are raised SDK limits, not `rateLimit()`.**
  claude.ai shares egress IPs, and `rateLimit()` writes site-wide IP blocks.
- **Upgrading**: `upgradeOAuthTables()` in `migrate.ts` adds the grant columns
  and backfills a grant per existing (member, app); idempotent.
- **Consent can narrow scopes, never widen them.** Client names are
  self-registered (untrusted); the consent page shows the redirect host.
- **The issuer comes from `PUBLIC_BASE_URL`** (defaults to
  `https://www.thefvc.is` in production), never the request.
- **Page customization** (`profiles.page_config`, `shared/page-config.ts`) is
  production-only: it is not in `Hermes/FVCfinalBoss`, which has its own themes.
- **Anything with a `user_id` FK must be deleted in the erasure job** if this
  repo ever gains one (FVCfinalBoss has it; foreign keys are on).

## Style

- Comments explain *why*, not *what*. Prefer one sentence of rationale over a
  restatement of the code.
- Match the surrounding file. Server code is plain functions + a `storage`
  class; client code is function components with TanStack Query.
- `data-testid` on anything Playwright will need.
- Run `npm run check` and `npm test` before declaring done.
