# Comprehensive Review Report: THEFVC.IS Sprint 5 + PRD-018 through PRD-022

**Date:** 2026-07-30  
**Scope:** Sprint 5 (PRD-006 + PRD-007) and additional hardening PRDs (018–022)  
**Repository:** `/opt/data/thefvc-app-source/`  
**Reviewer:** Hermes Agent  

---

## Executive Summary

The codebase has been significantly upgraded since the initial context snapshot. The actual files on disk include implementations for **all** PRDs 006–007 and 018–022, including encryption utilities, real Stripe Connect integration, subscription management, 1099 tax form generation, and GDPR/CCPA data export/deletion endpoints. Many of the critical compliance gaps identified in the initial context have been addressed.

However, several **critical bugs**, **security gaps**, and **production-readiness issues** remain. The most severe is a **password-reset bug** (`{ password: ... }` instead of `{ passwordHash: ... }`) that silently fails to reset passwords. Other critical issues include a **SQL injection vector** in `searchProfilesPaginated` via unsanitized `like()` wildcards, a **broken email template call** (passing a token where a context object is expected), and **hardcoded default credentials** in migrations.

---

## 1. Schema Design (`shared/schema.ts`)

### Findings

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 1.1 | **High** | `w9Forms.einOrSsn` column comment says "encrypted / last 4 only" but schema stores raw TEXT | The column is `text("ein_or_ssn").notNull()` with a comment claiming encryption, but the schema itself has no encryption enforcement. The encryption is done at the application layer in `routes.ts` (lines 1310, 1315, 1321) — this is acceptable but the comment is misleading. |
| 1.2 | **Medium** | `profiles` table lacks foreign key enforcement declaration | SQLite foreign keys are not enforced by default. The `profiles` table references `users.id` but there's no `PRAGMA foreign_keys = ON` call in the migration or server startup. |
| 1.3 | **Medium** | `subscriptionTiers` table has no `UNIQUE` constraint on `name` | Duplicate tier names (e.g., two "pro" tiers) could be inserted without error. |
| 1.4 | **Low** | `payments.metadata` is TEXT (JSON) but no indexing on `stripeSubscriptionId` | The `getPaymentsByStripeSubscriptionId` method queries by `stripeSubscriptionId` but there's no index. For production scale this will be slow. |
| 1.5 | **Low** | `w9Forms.status` has no default in the migration SQL | The `w9_forms` CREATE TABLE in `migrate.ts` has `status TEXT NOT NULL DEFAULT 'pending'`, but the schema.ts definition has `.default("pending")` — these are consistent. |
| 1.6 | **Info** | `securityAuditLog` and `analyticsEvents` tables are well-designed with proper indexes | Good use of FK references to `users.id`. |

### Recommendations
- Add `PRAGMA foreign_keys = ON;` in `migrate.ts` after database connection.
- Add `UNIQUE` constraint on `subscription_tiers.name`.
- Add index on `payments.stripe_subscription_id` and `payments.user_id` (already has FK but no explicit index).
- Update the `ein_or_ssn` column comment to clarify that encryption is application-layer.

---

## 2. Storage Layer (`server/storage.ts`)

### Findings

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 2.1 | **High** | `searchProfilesPaginated` — SQL injection via `like()` with user input | Lines 695–708: User-supplied `opts.role`, `opts.city`, and `opts.skill` are interpolated directly into `like(profiles.role, '%${opts.role}%')`. A user could inject `%` wildcards or SQL metacharacters. While Drizzle parameterizes values, the `LIKE` pattern is constructed with user input, allowing wildcard injection (e.g., `%%%` to match everything, or `%` to bypass filters). |
| 2.2 | **Medium** | `searchProfilesPaginated` — `sortBy` not validated against whitelist | Line 712–714: `opts.sortBy` is compared against `"dayRate"` and `"displayName"`, defaulting to `createdAt`. However, if `opts.sortBy` is `"dayRate"`, the code uses `profiles.dayRate` — but `dayRate` is nullable and sorting NULLs first/last is not specified. This is a minor correctness issue. |
| 2.3 | **Low** | `searchProfilesPaginated` — count query doesn't include skill filter | Line 718: The total count query uses `and(...conditions)` which includes `role`, `city`, `availability`, and `isPublic` — but **not** the `skill` filter. The skill filter is applied only to the data query (line 707–708), not the count query. This means `total` will be wrong when a skill filter is active. |
| 2.4 | **Low** | `getProfileByHandle` doesn't check `isPublic` | Line 229–233: `getProfileByHandle` looks up a user by handle and returns their profile, but doesn't filter on `isPublic`. Public profiles route (`/api/profiles/:handle`) exposes private profiles to anyone. |
| 2.5 | **Info** | `updateProfile` doesn't validate input | Line 243–246: `updateProfile` accepts arbitrary `Partial<InsertProfile>` data without validation. This is mitigated by client-side validation in `profile-edit.tsx`, but server-side validation is missing. |

### Recommendations
- **Critical:** Sanitize `like()` patterns in `searchProfilesPaginated` — escape `%` and `_` in user input, or use a dedicated search function.
- **Critical:** Fix the count query in `searchProfilesPaginated` to include the skill filter.
- Add `isPublic` check in `getProfileByHandle` or in the route handler.
- Add server-side input validation for `updateProfile`.

---

## 3. Migration Scripts (`server/migrate.ts`)

### Findings

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 3.1 | **High** | Hardcoded default admin password `FVCbuf2024!` in migration | Lines 262, 316: The admin password is hardcoded in the migration script. While it's an upgrade from `admin123`, any hardcoded password in source code is a security risk. |
| 3.2 | **Medium** | Admin email `jgvfilms@gmail.com` hardcoded in migration | Line 257: The admin user is auto-created with a specific email. This is a backdoor that should be removed or made configurable via environment variable. |
| 3.3 | **Medium** | Migration uses `ALTER TABLE ADD COLUMN` without handling non-nullable columns | Lines 234–238: When adding columns with `NOT NULL` constraints (e.g., if future migrations add required columns), the `ALTER TABLE` will fail on existing tables. Current PRD-007 columns all have defaults, so this is OK for now but is a risk for future migrations. |
| 3.4 | **Low** | No migration version tracking | The migration system is idempotent (checks `PRAGMA table_info` before adding columns) but doesn't track which migrations have been applied. This works for the current approach but doesn't scale to complex schema changes. |
| 3.5 | **Low** | `w9_forms` table in migration SQL doesn't match schema.ts | Migration SQL (line 218): `ein_or_ssn TEXT NOT NULL` — matches schema. However, the `stripe_account_id` column is present in the migration but the schema.ts `w9Forms` table also has it — consistent. |

### Recommendations
- Replace hardcoded admin password with environment variable or generate a random one-time password.
- Make admin email configurable via `ADMIN_EMAIL` env var.
- Consider adopting Drizzle Kit's migration system for future schema changes (the `drizzle.config.ts` is already configured but migrations are done via `migrate.ts` instead).

---

## 4. API Routes (`server/routes.ts`)

### Findings

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 4.1 | **Critical** | Password reset bug: `{ password: ... }` instead of `{ passwordHash: ... }` | Line 954: `storage.updateUser(user.id, { password: hashPassword(password) })` — the `users` table column is `password_hash`, and the schema field is `passwordHash`. Passing `password` as the key means the update sets a non-existent column and the password is **never actually changed**. The password reset silently fails. |
| 4.2 | **Critical** | Email template functions called with wrong arguments | Lines 922, 990: `passwordResetTemplate(token, user.displayName || user.handle)` and `emailVerificationTemplate(token, user.displayName || user.handle)` — but the template functions expect a **context object** (`{ resetUrl, userHandle }` and `{ verificationUrl, userHandle }`). Passing a string as the first argument means the template will interpolate `undefined` for all fields, producing broken emails. |
| 4.3 | **High** | `tax-export` endpoint leaks encrypted tax IDs | Line 1456: `taxId: w9?.einOrSsn || ""` — the `einOrSsn` field is encrypted (per the W-9 POST route at line 1315), but the tax export endpoint returns it **without decrypting**. The exported data contains encrypted blobs, not usable tax IDs. Alternatively, if the W-9 was created before encryption was added, it could be plaintext. Either way, this is a data integrity and compliance issue. |
| 4.4 | **High** | `tax-export` endpoint has a logic bug in email retrieval | Line 1455: `email: profile?.userId ? "" : ""` — this always returns `""` regardless of conditions. The intent was likely `email: profile?.userId ? "" : userEmail` or similar. |
| 4.4 | **High** | `tax-export` endpoint doesn't decrypt W-9 tax IDs | Line 1456: `taxId: w9?.einOrSsn || ""` returns the **encrypted** value. Should call `decryptSensitive()` first. |
| 4.5 | **Medium** | `updateUser` called with `password` field instead of `passwordHash` | Line 1580: `storage.updateUser(req.userId!, { email: ..., accessStatus: "revoked" })` — this is correct (only updating email and accessStatus). But the `updateUser` method signature accepts `Partial<InsertUser>` which includes `passwordHash`, not `password`. This is fine for this call but the password reset bug (4.1) is critical. |
| 4.6 | **Medium** | No input validation on `POST /api/w9` — `isValidTaxId` is called but `encryptSensitive` is not applied to `businessName` | Lines 1301–1323: Tax ID is validated and encrypted, but `businessName` and other fields are stored as plaintext. This is acceptable (business name is not PII/sensitive), but the `einOrSsn` encryption is correctly applied. |
| 4.7 | **Medium** | `POST /api/stripe/connect-account` creates a Stripe account on every call | Lines 1351–1378: There's no check for an existing `stripeConnectAccountId` before creating a new one. A user could create multiple Stripe accounts. |
| 4.8 | **Medium** | `POST /api/stripe/webhook` uses `rawBody` but Express JSON middleware may consume it | Lines 1395–1420: The webhook endpoint tries to use `(req as any).rawBody`, but the Express JSON middleware in `server/index.ts` (line 149–155) captures `rawBody` via the `verify` callback. However, the webhook endpoint is registered **after** `express.json()` is applied globally, so `rawBody` should be available. This needs verification. |
| 4.9 | **Low** | `GET /api/subscription` exposes `stripeCustomerId` to the client | Line 1181: Returns `stripeCustomerId` which is a Stripe internal identifier. Not a secret per se, but should only be exposed if needed. |
| 4.10 | **Low** | `GET /api/w9/forms` (admin) returns encrypted `einOrSsn` without decryption | Line 1346: Admin viewing W-9 forms gets encrypted tax IDs. Should decrypt for admin display. |
| 4.11 | **Low** | `POST /api/w9` returns `maskTaxId(einOrSsn)` (plaintext) instead of the encrypted value | Line 1335: The response returns the **plaintext** tax ID (masked), which is correct for the user's view. But the stored value is encrypted. This is actually correct behavior. |
| 4.12 | **Info** | Rate limiting is applied at route level for payment/w9/stripe endpoints | Lines 42–45: Good — PRD-018 rate limiting is in place. |
| 4.13 | **Info** | Audit logging is present for payment/W-9/tax-export access | Lines 1251–1258, 1282–1289, 1325–1332, 1353–1360, 1427–1434 — all sensitive endpoints log access. |

### Recommendations
- **Critical:** Fix password reset bug — change `{ password: ... }` to `{ passwordHash: ... }`.
- **Critical:** Fix email template calls — pass context objects with `resetUrl`/`verificationUrl` and `userHandle`.
- **High:** Decrypt `einOrSsn` in the tax-export endpoint.
- **Medium:** Add idempotency check for Stripe Connect account creation.
- **Medium:** Fix the `email` field logic bug in tax-export (`profile?.userId ? "" : ""` always returns `""`).
- **Low:** Decrypt W-9 tax IDs for admin view in `GET /api/w9/forms`.

---

## 5. Client-Side Implementations

### 5.1 Crew Finder (`client/src/pages/crew-finder.tsx`)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 5.1.1 | **Medium** | `getHandleFromProfile` generates handle from `displayName`, not the actual user handle | Line 299–301: The function converts `displayName` to a slug (e.g., "Sarah Kowalski" → "sarahkowalski"). But the actual user handle is stored in the `users` table, not the `profiles` table. The profile API doesn't return the handle. This means the generated URL may not match the actual user's handle, leading to 404s on profile pages. |
| 5.1.2 | **Low** | `JSON.parse(p.skills)` has no error handling | Line 203: If `p.skills` is malformed JSON, the page will crash. Should use try/catch. |
| 5.1.3 | **Low** | `placeholderData: (prev) => prev` keeps stale data indefinitely | Line 57: This prevents any refetching when filters change, which is intentional (keeps old data while new data loads). But combined with `key: ["crew-finder", ...]`, it should work correctly. |

### 5.2 Profile Edit (`client/src/pages/profile-edit.tsx`)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 5.2.1 | **Critical** | `apiRequestJson` call to update profile sends `data` as `Partial<Profile>` but `skills`, `videoLinks`, `socialLinks` are stringified | Lines 197–201: The form data is built as `Record<string, unknown>` with stringified JSON for skills/videos/socials. This is correct since the schema stores these as TEXT. However, if `skills.length === 0` (empty array), the code doesn't set `data.skills = "[]"`, meaning the existing skills are preserved. This may be intentional but is inconsistent. |
| 5.2.2 | **High** | `uploadMutation` uses hardcoded `API_BASE_LOCAL` with `__PORT_5000__` placeholder | Lines 110–116: The upload fetch uses `API_BASE_LOCAL` which is `"__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__"`. Since `"__PORT_5000__"` starts with `__`, this evaluates to `""` (empty string), which means the fetch goes to the same origin. This is correct for production but the variable name is misleading. |
| 5.2.3 | **Medium** | `handleSave` validation doesn't check for duplicate skills | Line 204–210: `addSkill` checks for duplicates, but `handleSave` doesn't. If a user manually edits the form state, duplicates could be saved. |
| 5.2.4 | **Low** | `getProfileCompleteness` checks `current.availability` but the default is `"available"` | Line 74: The availability check will always pass because the profile is created with `availability: "available"`. This makes the completeness score less meaningful. |
| 5.2.5 | **Info** | Profile completeness is well-implemented with 8 checks | Good UX with visual progress bar and missing field badges. |

### 5.3 Public Profile (`client/src/pages/public-profile.tsx`)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 5.3.1 | **Medium** | `setProfileMeta` doesn't reset previous meta tags | Lines 14–64: When navigating between profiles, old OG/Twitter tags from a previous profile may persist if the new profile has fewer tags. Should clear previous tags or use a library like `react-helmet`. |
| 5.3.2 | **Low** | `getEmbedUrl` regex patterns are not anchored | Lines 87–93: The YouTube and Vimeo regex patterns will match URLs that contain the domain anywhere, not just at the start. This could match malicious URLs. |
| 5.3.3 | **Info** | SEO meta tags are set client-side via `useEffect` | This works for client-rendered apps but won't be seen by crawlers that don't execute JavaScript. For true SEO, server-side rendering or pre-rendering is needed. |

### 5.4 Payments Page (`client/src/pages/payments.tsx`)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 5.4.1 | **Medium** | No "Subscribe" action on tier cards | Lines 167–194: The subscription tiers are displayed as static cards with no action button. Users can see tiers but cannot subscribe. The backend has `POST /api/subscription/checkout` but there's no UI to trigger it. |
| 5.4.2 | **Low** | `JSON.parse(tier.features || "[]")` has no error handling | Line 180: If `features` is malformed JSON, the page will crash. |
| 5.4.3 | **Info** | W-9 display correctly masks tax ID | Line 241: `w9.einOrSsn.slice(-4)` — but this is the **encrypted** value (since the API now decrypts and masks). The client receives a masked value from the API, so this is correct. |

### 5.5 W-9 Form (`client/src/pages/w9-form.tsx`)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 5.5.1 | **High** | Form pre-fill uses `existing?.einOrSsn` which is the **masked** value | Line 40: When editing an existing W-9, the form pre-fills `einOrSsn` with the masked value (e.g., `***-***-6789`) returned by `GET /api/w9`. The user cannot re-submit their full tax ID. |
| 5.5.2 | **Medium** | No EIN/SSN format validation on the client | Lines 73, 183–190: The form validates that the field is non-empty but doesn't validate the format. Server-side validation exists (`isValidTaxId`) but client-side validation would improve UX. |
| 5.5.3 | **Low** | `handleSubmit` sends the full `form` object including potentially stale `einOrSsn` | Line 90: If the user doesn't change the tax ID field, the masked value is sent to the server, which will fail `isValidTaxId` validation. |
| 5.5.4 | **Info** | The page claims "Your data is encrypted and stored securely" | Line 129: This is accurate — the server does encrypt via `encryptSensitive()`. |

### Recommendations (Client)
- **High:** Fix W-9 form pre-fill — either don't pre-fill the tax ID field, or fetch the decrypted value (which shouldn't be done for security), or use a separate "change" flow.
- **Medium:** Add "Subscribe" button to subscription tier cards in `payments.tsx`.
- **Medium:** Add error handling around `JSON.parse()` calls in client components.
- **Low:** Add client-side EIN/SSN format validation in `w9-form.tsx`.
- **Low:** Use `react-helmet` or similar for SEO meta tag management in `public-profile.tsx`.

---

## 6. Security & Compliance Analysis (PRD-018 through PRD-022)

### 6.1 Encryption at Rest (PRD-018)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 6.1.1 | **Medium** | Encryption key is hardcoded with a default fallback | `server/lib/encryption.ts` line 11: `const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "thefvc-encryption-key-change-in-production"`. If `ENCRYPTION_KEY` is not set, all "encrypted" data uses a publicly known key. |
| 6.1.2 | **Medium** | Only W-9 tax IDs are encrypted; other sensitive data is plaintext | Stripe customer IDs, payment intent IDs, and other PII are stored as plaintext in SQLite. |
| 6.1.3 | **Low** | No key rotation mechanism | The encryption function doesn't support key rotation. If the key is compromised, all encrypted data must be re-encrypted manually. |

### 6.2 Audit Trail (PRD-018)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 6.2.1 | **Info** | Audit logging is present for all sensitive endpoints | Payment access, W-9 access/submission, Stripe Connect, tax export, data export/deletion, and consent are all logged to `security_audit_log`. |
| 6.2.2 | **Low** | Audit logs don't include a request ID for correlation | No correlation ID is passed between the request and the audit log entry, making it hard to trace a full request lifecycle. |

### 6.3 Rate Limiting (PRD-018)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 6.3.1 | **Medium** | Rate limiting uses in-memory store | `server/middleware/rateLimit.ts` line 15: `const rateLimitStore = new Map()`. This doesn't work across multiple server instances/requests. For production, a Redis-backed store is needed. |
| 6.3.2 | **Low** | Rate limiting is not applied to auth endpoints | The global rate limit (100 req/15min per IP) is applied in `server/index.ts`, but auth endpoints (`/api/auth/login`, `/api/auth/signup`) don't have a stricter rate limit. Brute-force attacks are possible. |

### 6.4 PCI DSS (PRD-018)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 6.4.1 | **Info** | No card data is stored or processed by the application | All payment processing is handled by Stripe. The app only stores Stripe IDs (payment intent IDs, charge IDs, subscription IDs). This is PCI-compliant by design. |
| 6.4.2 | **Low** | No Content-Security-Policy nonce for inline scripts | The CSP header (line 23 of `securityHeaders.ts`) allows `'unsafe-inline'` for scripts, which is a PCI DSS concern. |

### 6.5 Data Privacy / GDPR / CCPA (PRD-022)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 6.5.1 | **High** | `POST /api/consent/cookie` doesn't require authentication | Line 1595: The consent endpoint accepts `req.userId || 0`, meaning unauthenticated users can submit consent. This is actually correct for cookie consent (which applies to anonymous users), but the audit log entry with `userId: 0` is a workaround. |
| 6.5.2 | **Medium** | Data export doesn't include session tokens or security logs | Lines 1494–1541: The export includes user, profile, payments, W-9, and feedback data, but doesn't include security audit logs, analytics events, or session data. GDPR requires a complete copy of personal data. |
| 6.5.3 | **Low** | Data deletion is soft-delete only | Lines 1548–1592: The endpoint marks the user as "revoked" and anonymizes the email, but doesn't delete data. This is actually correct for IRS compliance (7-year retention for tax records), but the user is not informed of this. |
| 6.5.4 | **Info** | Cookie consent endpoint exists | Good — PRD-022 is partially implemented. |

### 6.6 Stripe Connect Production Integration (PRD-019)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 6.6.1 | **Info** | Real Stripe Connect integration is implemented | `server/lib/stripe.ts` has `createStripeConnectAccount`, `createAccountLink`, `createPaymentIntent`, `handleStripeWebhook`. |
| 6.6.2 | **Medium** | Stripe SDK is initialized at module load with a fallback key | Line 11 of `stripe.ts`: `new Stripe(process.env.STRIPE_SECRET_KEY || "[REDACTED]", ...)`. If the env var is not set, the Stripe client will fail on any API call. This should throw an error at startup. |
| 6.6.3 | **Low** | Webhook endpoint doesn't have rate limiting | The Stripe webhook endpoint (`POST /api/stripe/webhook`) is not rate-limited, which is correct for Stripe webhooks (they come from known IPs), but should be protected with signature verification (which it is — line 1408). |

### 6.7 Subscription Management (PRD-020)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 6.7.1 | **Info** | Subscription management endpoints exist | `GET /api/subscription`, `POST /api/subscription/checkout`, `POST /api/subscription/cancel`. |
| 6.7.2 | **Medium** | No subscription upgrade/downgrade logic | The checkout endpoint creates a new Stripe Checkout Session but doesn't handle upgrading/downgrading existing subscriptions. |
| 6.7.3 | **Low** | `POST /api/subscription/cancel` doesn't handle proration | The cancel endpoint cancels the subscription but doesn't calculate or refund prorated amounts. |

### 6.8 Tax Document Generation (PRD-021)

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 6.8.1 | **High** | 1099 forms export **encrypted** tax IDs | `server/lib/tax-documents.ts` line 107: `recipientTIN: w9.einOrSsn || ""` — this returns the **encrypted** value, not the decrypted TIN. The 1099 forms will contain encrypted blobs instead of actual tax IDs. |
| 6.8.2 | **Medium** | Payer TIN is hardcoded | Line 134: `tin: "81-2345678"` — this is a placeholder. The actual payer EIN should be stored in configuration. |
| 6.8.3 | **Low** | No PDF generation — only JSON data structure | The `generate1099NECData` function returns a JSON object, not a printable PDF. The comment says "In production, this would be rendered to PDF" but there's no plan for this. |
| 6.8.4 | **Info** | 1099 eligibility threshold is correct | $600 in cents = 60000, matching the IRS threshold. |

### Recommendations (Compliance)
- **Critical:** Fix the password reset bug (see 4.1).
- **Critical:** Fix the email template calls (see 4.2).
- **High:** Decrypt tax IDs in tax-export and 1099 generation endpoints.
- **High:** Fix W-9 form pre-fill to not show masked tax ID as pre-filled value.
- **Medium:** Set `ENCRYPTION_KEY` as a required environment variable (throw at startup if missing).
- **Medium:** Add Redis-backed rate limiting for production.
- **Medium:** Add stricter rate limiting on auth endpoints.
- **Medium:** Add subscription upgrade/downgrade logic.
- **Low:** Use CSP nonce instead of `'unsafe-inline'`.
- **Low:** Add key rotation support for encryption.

---

## 7. Test Coverage

### Findings

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 7.1 | **High** | No tests for PRD-006, PRD-007, PRD-018–022 endpoints | The test suite (`tests/api/routes.test.ts`, `tests/e2e/crew-finder.spec.ts`) only covers auth, profiles, beta, feed, and compliance endpoints from earlier PRDs. No tests for payments, W-9, Stripe Connect, subscription management, tax export, 1099 generation, or data privacy endpoints. |
| 7.2 | **Medium** | Test `beforeEach` deletes from tables that may not exist | Lines 31–37: The `beforeEach` hook tries to `DELETE FROM` tables including `subscription_tiers`, `payments`, `w9_forms` — but the test setup imports `migrate.ts` which should create these. However, if the migration fails silently, tests will error. |
| 7.3 | **Low** | E2E crew-finder tests use `waitForTimeout` instead of `waitForSelector` | Lines 44, 55, 77: Using fixed timeouts is flaky and slow. Should use `waitForSelector` or `waitForResponse`. |

### Recommendations
- Add API integration tests for all PRD-007 and PRD-018–022 endpoints.
- Add E2E tests for W-9 form submission, subscription checkout, and data export/deletion.
- Replace `waitForTimeout` with proper wait conditions in E2E tests.

---

## 8. Dependency & Infrastructure

### Findings

| # | Severity | Finding | Detail |
|---|----------|---------|--------|
| 8.1 | **Info** | `stripe` SDK v14.23.0 is included | Correct for the Stripe API version `2024-09-18.acacia`. |
| 8.2 | **Info** | `express-rate-limit` is in dependencies but not used | The custom rate limiter in `server/middleware/rateLimit.ts` is used instead. `express-rate-limit` should be removed from dependencies. |
| 8.3 | **Low** | No `helmet` configuration beyond defaults | `helmet` is in dependencies and used via `securityHeaders` middleware, but the CSP is manually configured rather than using Helmet's CSP. |
| 8.4 | **Info** | `dotenv` is loaded in `server/index.ts` | Good — environment variables are loaded at startup. |

---

## 9. Critical Bugs Summary (Must Fix Before Production)

| Priority | Bug | Location | Impact |
|----------|-----|----------|--------|
| **P0** | Password reset doesn't update password | `routes.ts:954` — `{ password: ... }` should be `{ passwordHash: ... }` | Password reset is completely broken; users cannot reset passwords |
| **P0** | Email templates called with wrong arguments | `routes.ts:922, 990` — passing strings instead of context objects | Password reset and email verification emails will be blank/broken |
| **P0** | Tax export returns encrypted tax IDs | `routes.ts:1456` — `w9?.einOrSsn` is encrypted | Tax documents contain encrypted blobs, not usable TINs |
| **P0** | 1099 forms contain encrypted tax IDs | `tax-documents.ts:107` — `w9.einOrSsn` is encrypted | 1099 forms are invalid for IRS filing |
| **P1** | W-9 form pre-fill shows masked tax ID | `w9-form.tsx:40` — `existing?.einOrSsn` is masked | Users cannot edit their W-9 without re-entering the full tax ID |
| **P1** | SQL LIKE injection in searchProfilesPaginated | `storage.ts:695-708` — unsanitized user input in `like()` | Users can bypass filters or cause performance issues with wildcard injection |
| **P1** | Count query doesn't include skill filter | `storage.ts:718` — skill filter missing from total count | Pagination shows wrong total count when skill filter is active |
| **P1** | `email` field in tax-export always returns `""` | `routes.ts:1455` — `profile?.userId ? "" : ""` | Tax export data is missing email addresses |

---

## 10. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Password reset silently fails | **Critical** | High | Fix the `password` → `passwordHash` field name |
| Tax documents contain encrypted data | **Critical** | High | Decrypt tax IDs in export/generation endpoints |
| Users cannot edit W-9 tax ID | **High** | High | Don't pre-fill masked tax ID; add "change" flow |
| SQL wildcard injection in search | **High** | Medium | Escape `%` and `_` in LIKE patterns |
| Hardcoded encryption key | **High** | Medium | Require `ENCRYPTION_KEY` env var; fail at startup |
| In-memory rate limiting | **Medium** | High (multi-instance) | Use Redis-backed store in production |
| No auth endpoint rate limiting | **Medium** | High | Add stricter rate limits on login/signup |
| No subscription upgrade/downgrade | **Medium** | Medium | Implement Stripe subscription update API |
| Hardcoded payer TIN in 1099 | **Medium** | High | Move to environment variable |
| Missing tests for new endpoints | **Medium** | High | Add comprehensive test coverage |

---

## 11. Recommendations Summary

### Immediate (Blocker — Fix Before Any Release)
1. **Fix password reset bug** — Change `{ password: hashPassword(password) }` to `{ passwordHash: hashPassword(password) }` in `routes.ts:954`
2. **Fix email template calls** — Pass context objects: `{ resetUrl: ..., userHandle: ... }` and `{ verificationUrl: ..., userHandle: ... }`
3. **Decrypt tax IDs in tax-export** — Call `decryptSensitive(w9.einOrSsn)` before exporting
4. **Decrypt tax IDs in 1099 generation** — Same fix in `tax-documents.ts:107`
5. **Fix W-9 form pre-fill** — Don't pre-fill the masked tax ID; show a placeholder or "••••••••"

### Short-Term (Next Sprint)
6. Sanitize LIKE patterns in `searchProfilesPaginated` to prevent wildcard injection
7. Fix the count query to include skill filter
8. Fix the `email` field logic bug in tax-export (`profile?.userId ? "" : ""`)
9. Add `PRAGMA foreign_keys = ON` in migration
10. Require `ENCRYPTION_KEY` env var; throw at startup if missing
11. Add idempotency check for Stripe Connect account creation
12. Add "Subscribe" button to subscription tier cards in `payments.tsx`
13. Add server-side input validation for `updateProfile`

### Medium-Term (Next 1–2 Sprints)
14. Move payer TIN to environment variable
15. Implement subscription upgrade/downgrade logic
16. Add Redis-backed rate limiting for production
17. Add stricter rate limiting on auth endpoints (login, signup, password reset)
18. Replace `'unsafe-inline'` CSP with nonce-based approach
19. Add key rotation support for encryption
20. Add comprehensive test coverage for all PRD-007 and PRD-018–022 endpoints
21. Add data export of security audit logs and analytics events for GDPR compliance
22. Replace `waitForTimeout` with proper wait conditions in E2E tests

### Long-Term (Production Hardening)
23. Implement PDF generation for 1099 forms (PDFKit or Puppeteer)
24. Add CSRF protection for state-changing endpoints
25. Implement proper migration versioning (Drizzle Kit migrations)
26. Add monitoring and alerting for security events
27. Implement data retention policy with automated cleanup
28. Add CSP reporting endpoint
29. Implement proper session invalidation on password change
30. Add multi-factor authentication (MFA) support

---

## 12. File Inventory

### Files Reviewed
- `shared/schema.ts` — Schema definitions for all tables (475 lines)
- `server/storage.ts` — Storage layer / DatabaseStorage class (730 lines)
- `server/migrate.ts` — Idempotent migration script (369 lines)
- `server/routes.ts` — Express route handlers (1641 lines)
- `server/index.ts` — Server bootstrap, middleware, WebSocket setup (257 lines)
- `server/middleware/auth.ts` — Authentication middleware (60 lines)
- `server/middleware/securityHeaders.ts` — Security headers middleware (48 lines)
- `server/middleware/rateLimit.ts` — Rate limiting middleware (162 lines)
- `server/middleware/sanitize.ts` — Input sanitization middleware (50 lines)
- `server/lib/encryption.ts` — AES-256-GCM encryption utilities (98 lines)
- `server/lib/stripe.ts` — Stripe Connect integration (159 lines)
- `server/lib/tax-documents.ts` — 1099 form generation (216 lines)
- `server/jobs/scheduler.ts` — Background job scheduler (69 lines)
- `server/email/queue.ts` — Email queue processing (165 lines)
- `server/email/templates.ts` — Email templates (128 lines)
- `server/analytics/index.ts` — Analytics and security event logging (162 lines)
- `server/static.ts` — Static file serving (20 lines)
- `client/src/pages/crew-finder.tsx` — Crew finder with pagination/filters (301 lines)
- `client/src/pages/profile-edit.tsx` — Profile editor with validation (684 lines)
- `client/src/pages/public-profile.tsx` — Public profile with SEO (457 lines)
- `client/src/pages/payments.tsx` — Payments/subscriptions/tax docs page (275 lines)
- `client/src/pages/w9-form.tsx` — W-9 form page (269 lines)
- `client/src/pages/auth.tsx` — Auth page (365 lines)
- `client/src/App.tsx` — App routing (100 lines)
- `client/src/lib/queryClient.ts` — API client (111 lines)
- `client/src/lib/auth.tsx` — Auth context (89 lines)
- `package.json` — Dependencies (133 lines)
- `migrations/0000_abandoned_rhino.sql` — Initial Drizzle migration (81 lines)
- `tests/api/routes.test.ts` — API integration tests (786 lines)
- `tests/e2e/crew-finder.spec.ts` — E2E tests for crew finder (92 lines)
- `tests/server.ts` — Test server helper (81 lines)

### Files Created
- `/opt/data/thefvc-app-source/REVIEW_REPORT_SPRINT5_PRD018_022.md` — This report

---

## 13. Overall Assessment

The codebase demonstrates significant progress on compliance and security hardening. The implementation of PRD-018 through PRD-022 shows a mature understanding of the requirements:

- ✅ Encryption at rest for W-9 tax IDs (AES-256-GCM)
- ✅ Audit trail for all sensitive operations
- ✅ Rate limiting on payment/W-9/Stripe endpoints
- ✅ Real Stripe Connect integration (not placeholder)
- ✅ Subscription management endpoints (checkout, cancel)
- ✅ 1099 form generation logic
- ✅ GDPR/CCPA data export and deletion endpoints
- ✅ Cookie consent endpoint
- ✅ Security headers (CSP, HSTS, X-Frame-Options, etc.)
- ✅ Input sanitization middleware
- ✅ In-memory rate limiting with IP blocking

However, there are **5 critical bugs** that must be fixed before any production release:

1. **Password reset is completely broken** — the field name mismatch means passwords are never updated
2. **Email templates produce broken emails** — context objects are not passed correctly
3. **Tax export and 1099 generation return encrypted tax IDs** — these documents are unusable
4. **W-9 form pre-fill shows masked tax ID** — users cannot edit their existing W-9
5. **SQL LIKE injection** in search — user input is not sanitized before being used in LIKE patterns

These bugs are in core functionality (auth, payments, tax compliance) and represent significant risk. The good news is that all fixes are straightforward and well-understood.

**Recommendation:** Do not deploy to production until all P0 bugs are fixed and validated with tests. The compliance framework is sound, but the implementation has critical defects that undermine it.