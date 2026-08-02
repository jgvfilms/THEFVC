# PRD-024: Pre-Launch Hardening — Verification & Remaining Gaps

**Date:** 2026-08-01
**Scope:** Verify every finding in `REVIEW_REPORT_SPRINT5_PRD018_022.md` (2026-07-30)
against current `HEAD` (`44be522`), plus new findings from independent testing.
**Method:** Direct code inspection and runtime testing against a live instance —
not a re-read of the old report. Every "Fixed" item below was confirmed in the
current source, not assumed from a commit message.

---

## Why this document exists

The Sprint 5 review found 5 P0 bugs and ~30 other issues. A lot of follow-up work
happened after that review was written — commit history shows dedicated fix passes
for password reset, tax ID decryption, SQL injection, IDOR, and IP spoofing, among
others. Re-running the old checklist as-is would waste engineering time re-fixing
things that are already done, and — worse — would miss two new bugs that the fix
passes themselves introduced. This PRD replaces the old checklist with current,
verified status, and adds what's actually still open.

---

## 1. Already fixed — verified in current code

No action needed. Listed so nothing here gets re-litigated.

| Original # | Finding | Verified fix |
|---|---|---|
| 4.1 | Password reset didn't persist (`password` vs `passwordHash`) | `routes.ts:1027` uses `passwordHash` correctly |
| 4.2 | Email templates called with wrong argument shape | `routes.ts:991,1064` now pass context objects |
| 4.3/4.4 | Tax export leaked encrypted TIN; email field always empty | Both fixed — *see 3.1 below for a new issue in the same code* |
| 6.8.1 | 1099 generation used encrypted TIN | Fixed — *see 3.1 below* |
| 6.8.2 | Payer TIN hardcoded | Now `process.env.PAYER_TIN`, throws at startup if unset |
| 5.5.1 | W-9 form pre-filled the *masked* tax ID | Form now always requires re-entry, never pre-fills |
| 2.1 | SQL LIKE wildcard injection in profile search | Escaping added — *see 3.2 below for a new issue in the same fix* |
| 2.3 | Search total count ignored the skill filter | Fixed — count and data queries now share one `conditions` array |
| 2.4 | Private profiles exposed via handle lookup | Route now checks `isPublic`, returns 403 |
| 6.1.1 | Encryption key had a public fallback default | Now required; throws at startup if missing |
| 1.2 | No FK enforcement in SQLite | `PRAGMA foreign_keys = ON` present in `migrate.ts` |
| 1.3 | No UNIQUE constraint on subscription tier name | `shared/schema.ts` — `name` is `.unique()` |
| 4.7 | Stripe Connect account could be duplicated | Idempotency check added before account creation |
| 6.3.2 | No stricter rate limit on login/signup | Dedicated limits now on `/api/auth/login`, `/signup`, `/password-reset` |
| 5.4.1 | No Subscribe button on tier cards | Implemented, wired to checkout |
| 6.7.2 | No subscription upgrade/downgrade | Implemented |
| 6.5.2 | GDPR export was incomplete | Extended per commit history |
| — | *(new, not in original report)* IDOR on production/crew endpoints — any authenticated user could read/modify any other user's crew list and budget | Ownership checks added on all affected routes |
| — | *(new)* Rate limiter trusted the forgeable client-supplied end of `X-Forwarded-For` | Now reads from the trusted-proxy-configured position |
| — | DATABASE_PATH env var documented but never wired up (found during this deploy work, not the original review) | Fixed in `44be522` — see prior conversation |

---

## 2. Still open from the original review

Prioritized by actual current risk, not the original numbering.

| Priority | Finding | Current status | Suggested fix | Effort |
|---|---|---|---|---|
| P2 | CSP allows `'unsafe-inline'` for scripts/styles | Confirmed still present in `securityHeaders.ts:24-25` | Move inline styles/scripts out, switch to nonce-based CSP | M |
| P2 | 1099 output is a JSON structure, not a real PDF | Confirmed — comment in `tax-documents.ts` still says "would be rendered to PDF" | Add PDFKit or similar for actual filing-ready output | M |
| P3 | `express-rate-limit` listed in `package.json` but unused (custom limiter is used instead) | Confirmed zero imports | `npm uninstall express-rate-limit` | XS |
| P3 | No index on `payments.stripeSubscriptionId` | Confirmed no index in schema | Add index in schema + migration | XS |
| P3 | Rate limit store is file-backed, not shared across instances | Acceptable for a single-instance deploy (which is what we're setting up on Railway); revisit if you ever run >1 instance | Redis-backed store if/when you scale horizontally | — (deferred, not a blocker) |
| P3 | No CSRF protection on state-changing endpoints | Confirmed no CSRF middleware. **Lower actual risk than it looks**: auth is pure `Authorization: Bearer` header (`middleware/auth.ts`), not cookies — browsers don't auto-attach bearer tokens cross-site, which is the mechanism CSRF exploits. Recommend documenting this as an accepted risk rather than treating it as an open gap, *unless* a cookie-based auth path gets added later. | Document as accepted risk now; revisit if auth model changes | XS (docs only) |
| P3 | No MFA | Not implemented | Post-launch feature, not a blocker | L |

---

## 3. New findings — not in the original review

These surfaced from directly testing the current code, not from reading it.

### 3.1 — P0: Tax export and 1099 generation now return a *masked* TIN, not the real one

The original bug (leaking an encrypted blob) is fixed, but the fix went further
than intended: both `/api/admin/tax-export` (`routes.ts:1601`) and 1099 generation
(`tax-documents.ts:110`) now run the decrypted value through `maskTaxId()` before
returning it — e.g. `***-***-6789`.

That's the right call for anything rendered in the admin UI. It's the wrong call
here: these two code paths exist specifically to produce IRS-fileable documents,
which need the full 9-digit TIN. As shipped, **the tax export and 1099 output are
still not usable for actual filing** — just for a different reason than before.

This needs a product decision, not just a code fix: who is allowed to see a full,
unmasked TIN, and through what path? Two reasonable options:
- A separate, extra-audited "reveal full TIN for filing" admin action, distinct
  from the general tax-export/view endpoints, or
- If 1099 filing is being handed to a payroll/compliance vendor, give *that*
  integration a secure server-to-server path to the decrypted value, and keep
  every human-facing endpoint masked.

Either way, decide this before year-end filing depends on it.

### 3.2 — P1: LIKE-escaping fix doesn't work — legitimate searches with `%` or `_` return zero results

`storage.ts`'s `escapeLike()` writes a literal backslash in front of `%`/`_`
characters, but the query is a plain Drizzle `like()` call with no `ESCAPE '\'`
clause attached. I tested this directly against SQLite: without that clause, a
backslash in a LIKE pattern is just a literal character, not an escape — so an
escaped pattern doesn't match the thing it's supposed to match, or anything else.

Practical effect: the original wildcard-injection hole is closed (good), but
anyone searching for a role, city, or skill that happens to contain a literal `%`
or `_` will silently get zero results. Low real-world frequency, but it's a
correctness regression from the "fix."

Fix: append an escape clause to the two `like()` calls, e.g. wrap with Drizzle's
`sql` template — `sql`${profiles.role} LIKE ${pattern} ESCAPE '\'`` — or use
Drizzle's own escape handling if the version in use supports it. Small, contained
fix; worth a regression test given it silently fooled a prior review pass.

### 3.3 — P0 for this specific deploy: rate-limit file path isn't on the persistent volume

`rateLimit.ts` writes its persistence file to `join(process.cwd(), "data", ".rate-limits.json")`.
On Railway (per `DEPLOY.md`), the persistent volume is mounted at `/data`, and only
`DATABASE_PATH` was pointed at it. `process.cwd()` on Railway resolves to the app
root, not the volume — so this file lives on the ephemeral part of the filesystem.
The "file-backed persistence" from the earlier fix pass will silently stop
persisting across redeploys on this specific host, reverting to memory-only
behavior each time, even though nothing looks broken locally.

Fix: read the directory from an env var the same way `DATABASE_PATH` now works,
e.g. `RATE_LIMIT_DIR`, defaulting to `./data` for local dev, and set it to `/data`
alongside `DATABASE_PATH` in Railway's variables. Small fix, same shape as the
`DATABASE_PATH` change already made.

---

## 4. Suggested sequencing

**Before onboarding real members (blockers):**
1. Decide and implement the TIN-exposure path (3.1)
2. Fix `RATE_LIMIT_DIR` so it lands on the volume (3.3) — trivial, do alongside any other env work

**Next sprint:**
3. Fix LIKE escaping with a proper `ESCAPE` clause (3.2)
4. CSP nonce instead of `'unsafe-inline'` (2)
5. Real PDF generation for 1099s if you're filing directly rather than through a vendor (2)

**Whenever convenient (no urgency):**
6. Drop unused `express-rate-limit` dependency
7. Add the missing index on `payments.stripeSubscriptionId`
8. Document the CSRF risk-acceptance decision in one line somewhere durable (this file, or a security notes doc)

---

## 5. What this document is *not*

It doesn't re-verify the "Info"-severity items from the original report (things
already confirmed working, like audit logging or PCI scope) — those were fine
then and nothing in the intervening commits touched them. It also doesn't
re-run the full test suite or attempt new penetration testing; the findings above
came from direct code reading plus targeted runtime checks on the specific claims
that mattered.
