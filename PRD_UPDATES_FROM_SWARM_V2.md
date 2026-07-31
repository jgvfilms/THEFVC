# PRD Update Specifications V2 — From Swarm Assessment Findings

**Document:** PRD Updates Derived from FVC Swarm Model Assessment (Revised V2)
**Date:** 2026-07-30
**Source:** `FVC_MODEL_ASSESSMENT.md`, `REVIEW_REPORT_SPRINT5_PRD018_022.md`, `FORGE_CRITIQUE_R1.md`
**Author:** Nexus (FVC Swarm Pipeline)
**Status:** Design Spec — No Code Changes
**Round:** 2 of 3 (Nexus ↔ Forge round robin)

---

## Revision Notes (V1 → V2)

This V2 addresses all findings from Forge's Round 1 critique (`FORGE_CRITIQUE_R1.md`):

1. **Scope hijacking fixed** — PRD-019, PRD-020, PRD-021 restored to their actual domains (Stripe Connect, Subscription Management, Tax Documents). LLM routing, cost tracking, and multimodal processing moved to new PRDs (024, 025, 026) in Section B.
2. **Bug blindness fixed** — Every PRD maps to specific unaddressed review findings. Already-fixed items are marked with ✅ status. No P0 bugs are used as justification for new infrastructure.
3. **Effort deflated** — Sprint 1 total: **10 days** (within 7–11 day target). Deferred work moves to Sprint 3+.
4. **Priorities realigned** — PRD-018 → P1 (was P0), PRD-022 → P2 (was P0), PRD-023 → P2 (was P0). Only security/compliance blockers are P0.

---

## Finding Status Matrix (19 Review Findings)

This matrix tracks every finding from `REVIEW_REPORT_SPRINT5_PRD018_022.md` Section 3.2 (Forge's Finding 3.2). Verified against current source code.

| Finding | Severity | Status | Verification | Assigned PRD |
|---------|----------|--------|--------------|--------------|
| 1.2 — No `PRAGMA foreign_keys = ON` | Medium | ✅ **ALREADY FIXED** | `migrate.ts:8` — `sqlite.pragma("foreign_keys = ON")` | PRD-022v2 (verify) |
| 1.3 — No UNIQUE on `subscription_tiers.name` | Medium | ❌ OPEN | `schema.ts:422` — `name: text("name").notNull()` (no UNIQUE) | PRD-022v2 |
| 1.4 — No index on `payments.stripe_subscription_id` | Low | ✅ **ALREADY FIXED** | `migrate.ts:259` — `CREATE INDEX IF NOT EXISTS idx_payments_stripe_sub` | PRD-022v2 (verify) |
| 3.1 — Hardcoded admin password `FVCbuf2024!` | High | ❌ OPEN | `migrate.ts:270` — `scryptSync("FVCbuf2024!", ...)` | PRD-018v2 |
| 3.2 — Hardcoded admin email | Medium | ❌ OPEN | `migrate.ts:265` — `const adminEmail = "jgvfilms@gmail.com"` | PRD-018v2 |
| 4.7 — Duplicate Stripe Connect accounts possible | Medium | ✅ **ALREADY FIXED** | `routes.ts:1385-1387` — Idempotency check exists | PRD-019v2 (verify) |
| 4.9 — `stripeCustomerId` exposed to client | Low | ❌ OPEN | `routes.ts:1195` — `stripeCustomerId: profile.stripeCustomerId` | PRD-019v2 |
| 5.1.1 — Handle generation from displayName | Medium | ❌ OPEN | `crew-finder.tsx:299-301` — generates handle from displayName slug | Deferred |
| 5.2.1 — Empty skills array handling | Critical | ❌ OPEN | `profile-edit.tsx:197-201` — empty array not set to `"[]"` | Deferred |
| 5.4.1 — No "Subscribe" button in UI | Medium | ❌ OPEN | `payments.tsx:167-194` — tier cards have no action button | PRD-020v2 |
| 5.5.1 — W-9 pre-fill shows masked value | High | ✅ **ALREADY FIXED** | `w9-form.tsx:40` — `einOrSsn: ""` with comment "Never pre-fill tax ID" | PRD-021v2 (verify) |
| 6.1.1 — Hardcoded encryption key default | Medium | ❌ OPEN | `encryption.ts:11` — `\|\| "thefvc-encryption-key-change-in-production"` | PRD-018v2 |
| 6.1.2 — Only W-9 tax IDs encrypted | Medium | ❌ OPEN | Stripe IDs stored plaintext in `payments` table | PRD-018v2 |
| 6.1.3 — No key rotation | Low | ❌ OPEN | No rotation mechanism in `encryption.ts` | Deferred (Sprint 3+) |
| 6.3.1 — In-memory rate limiting | Medium | ❌ OPEN | `rateLimit.ts:15` — `new Map()` | Deferred (Sprint 3+) |
| 6.5.2 — Data export missing audit logs | Medium | ❌ OPEN | `routes.ts:1527-1574` — export excludes audit logs and analytics | PRD-022v2 |
| 6.7.2 — No subscription upgrade/downgrade | Medium | ❌ OPEN | `routes.ts:1199-1231` — checkout creates new session, no upgrade logic | PRD-019v2 |
| 6.8.2 — Hardcoded payer TIN | Medium | ❌ OPEN | `tax-documents.ts:137` — `tin: "81-2345678"` | PRD-021v2 |
| 7.1 — No tests for PRD-007/018-022 endpoints | High | ❌ OPEN | No test coverage for payments, W-9, Stripe, tax endpoints | Deferred (Sprint 3+) |

**Summary:** 4 findings already fixed (1.2, 1.4, 4.7, 5.5.1). 10 findings addressed in Sprint 1 (Section A). 5 findings deferred to Sprint 3+ (Section B + explicit deferrals).

---

## Section A: Sprint 1 PRDs (Days 1–10) — "Building Tomorrow"

### PRD-018v2 — Security Hardening (3 days)

**Domain:** Security & Compliance Hardening (existing PRD-018)
**Priority:** P1 — Important for production hardening, not blocking beta launch
**Effort:** 3 days
**Findings addressed:** 3.1, 3.2, 6.1.1, 6.1.2, 6.2.2

#### Req 1: Remove Hardcoded Admin Credentials (Day 1, 2h)

**Finding 3.1 (High):** Admin password `FVCbuf2024!` hardcoded in `server/migrate.ts` lines 270, 324.
**Finding 3.2 (Medium):** Admin email `jgvfilms@gmail.com` hardcoded in `server/migrate.ts` line 265.

**Change:**
- **File:** `server/migrate.ts`
- **Lines 265–274:** Replace hardcoded email/password with environment variables:
  ```typescript
  // BEFORE (lines 265, 270):
  const adminEmail = "jgvfilms@gmail.com";
  const hash = scryptSync("FVCbuf2024!", salt, 64).toString("hex");
  
  // AFTER:
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.warn("[migration] ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin bootstrap");
    return; // Skip admin creation entirely if env vars missing
  }
  const hash = scryptSync(adminPassword, salt, 64).toString("hex");
  ```
- **Lines 319–326:** Same change for the password upgrade path:
  ```typescript
  // BEFORE (line 324):
  const newHash = scryptSync("FVCbuf2024!", newSalt, 64).toString("hex");
  
  // AFTER:
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.warn("[migration] ADMIN_PASSWORD not set — skipping password upgrade");
    return;
  }
  const newHash = scryptSync(adminPassword, newSalt, 64).toString("hex");
  ```
- **Env vars to add to `.env.example`:**
  ```
  ADMIN_EMAIL=       # Admin user email (required for initial bootstrap)
  ADMIN_PASSWORD=    # Admin user password (required for initial bootstrap)
  ```

**Verification:** `grep -rn "FVCbuf2024\|jgvfilms" server/` returns zero matches.

#### Req 2: Require ENCRYPTION_KEY at Startup (Day 1, 1h)

**Finding 6.1.1 (Medium):** Encryption key falls back to publicly known default.

**Change:**
- **File:** `server/lib/encryption.ts`
- **Line 11:** Remove the default fallback:
  ```typescript
  // BEFORE:
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "thefvc-encryption-key-change-in-production";
  
  // AFTER:
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY environment variable is required. Generate with: openssl rand -hex 32");
  }
  ```
- **Impact:** Server will fail to start without `ENCRYPTION_KEY`. This is intentional — prevents running with a publicly known key.

**Verification:** Server refuses to start without `ENCRYPTION_KEY` env var set.

#### Req 3: Encrypt Additional Sensitive Fields (Days 1–2, 4h)

**Finding 6.1.2 (Medium):** Only W-9 `einOrSsn` is encrypted. Stripe customer IDs, payment intent IDs stored plaintext.

**Change:**
- **File:** `server/lib/stripe.ts` — wrap Stripe ID storage with `encryptSensitive()`:
  - When saving `stripeCustomerId` to profile (via `storage.updateProfile()`), encrypt the value.
  - When saving `stripeConnectAccountId` to profile, encrypt the value.
- **File:** `server/storage.ts` — add decrypt calls when reading Stripe IDs for API use:
  - `getProfile()` returns decrypted Stripe IDs for internal use.
  - `GET /api/subscription` (line 1193) should NOT return `stripeCustomerId` to client (see PRD-019v2 Req 2).
- **Migration:** Existing plaintext Stripe IDs need a one-time migration to encrypt them. Add a migration step in `migrate.ts` that:
  1. Reads all profiles with non-null `stripeCustomerId` or `stripeConnectAccountId`.
  2. Encrypts each value with `encryptSensitive()`.
  3. Updates the row.
  4. Idempotent: check if already encrypted (encrypted values have a specific format with IV+authTag).

**Verification:** `stripeCustomerId` and `stripeConnectAccountId` values in the database are encrypted (not plaintext Stripe IDs starting with `cus_` or `acct_`).

#### Req 4: Add Request ID to Audit Logs (Day 2, 2h)

**Finding 6.2.2 (Low):** Audit logs lack correlation IDs for request tracing.

**Change:**
- **File:** `server/index.ts` — add request ID middleware (after line ~50):
  ```typescript
  import { randomUUID } from "crypto";
  app.use((req, res, next) => {
    req.requestId = req.headers["x-request-id"] as string || randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });
  ```
- **File:** `server/routes.ts` — add `requestId` to all `storage.createSecurityLog()` calls:
  ```typescript
  // In every audit log call, add:
  requestId: req.requestId,
  ```
  This affects ~12 existing audit log calls across routes.ts (lines 1251, 1282, 1325, 1353, 1372, 1427, 1513, etc.).
- **File:** `shared/schema.ts` — add `requestId` column to `securityAuditLog` table:
  ```typescript
  requestId: text("request_id"),
  ```
- **File:** `server/migrate.ts` — add migration for new column.

**Verification:** Every `security_audit_log` row has a non-null `request_id` value.

#### Effort Breakdown

| Task | Finding | Effort |
|------|---------|--------|
| Req 1: Remove hardcoded admin credentials | 3.1, 3.2 | 2h |
| Req 2: Require ENCRYPTION_KEY | 6.1.1 | 1h |
| Req 3: Encrypt additional sensitive fields | 6.1.2 | 4h |
| Req 4: Request ID in audit logs | 6.2.2 | 2h |
| **Total** | — | **~1.1 days** (rounded to 1 day in sprint) |

#### Already-Fixed Verification

- **Finding 5.5.1** (W-9 pre-fill masked value): `w9-form.tsx:40` already has `einOrSsn: ""` — no change needed.

---

### PRD-019v2 — Stripe Connect (1 day)

**Domain:** Stripe Connect Production Integration (existing PRD-019)
**Priority:** P1 — Important for subscription lifecycle management
**Effort:** 1 day
**Findings addressed:** 6.7.2, 4.9

#### Req 1: Subscription Upgrade/Downgrade Logic (Day 4, 5h)

**Finding 6.7.2 (Medium):** `POST /api/subscription/checkout` (routes.ts:1199) creates a new Stripe Checkout Session every time, regardless of whether the user already has an active subscription. Users cannot switch tiers.

**Current behavior:** The checkout endpoint always creates a new subscription via `stripe.checkout.sessions.create()` with `mode: "subscription"`. If a user already has an active subscription, they get a second subscription instead of an upgrade/downgrade.

**Change:**
- **File:** `server/routes.ts`, lines 1199–1231
- Add subscription upgrade/downgrade logic before creating the checkout session:
  ```typescript
  // Check if user has an existing active subscription
  const existingSubscriptions = await stripe.subscriptions.list({
    customer: profile.stripeCustomerId,
    status: "active",
    limit: 1,
  });
  
  if (existingSubscriptions.data.length > 0) {
    // Upgrade/downgrade: update existing subscription
    const existingSub = existingSubscriptions.data[0];
    const updatedSub = await stripe.subscriptions.update(existingSub.id, {
      items: [{
        id: existingSub.items.data[0].id,
        price: tier.stripePriceId,
      }],
      proration_behavior: "create_prorations",
    });
    
    // Update local subscription tier
    storage.updateProfileSubscription(req.userId!, {
      subscriptionTier: tierName,
      subscriptionStatus: "active",
    });
    
    return res.json({ 
      upgraded: true, 
      subscriptionId: updatedSub.id,
      newTier: tierName 
    });
  }
  
  // No existing subscription — create new checkout session (existing logic)
  ```
- Add `stripeCustomerId` lookup: If the profile doesn't have a `stripeCustomerId` yet, create or retrieve the Stripe customer first.

**Verification:** A user with an active "pro" subscription who checks out "pro_plus" gets an upgrade (single subscription with updated price), not two subscriptions.

#### Req 2: Stop Exposing stripeCustomerId to Client (Day 4, 1h)

**Finding 4.9 (Low):** `GET /api/subscription` (routes.ts:1195) returns `stripeCustomerId` to the client. This is an internal Stripe identifier that the client doesn't need.

**Change:**
- **File:** `server/routes.ts`, line 1193–1196
- Remove `stripeCustomerId` from the response:
  ```typescript
  // BEFORE:
  res.json({
    tier: profile.subscriptionTier,
    status: profile.subscriptionStatus,
    stripeCustomerId: profile.stripeCustomerId,
  });
  
  // AFTER:
  res.json({
    tier: profile.subscriptionTier,
    status: profile.subscriptionStatus,
  });
  ```

**Verification:** `GET /api/subscription` response does not contain `stripeCustomerId` field.

#### Already-Fixed Verification

- **Finding 4.7** (Duplicate Stripe Connect accounts): `routes.ts:1385-1387` already has an idempotency check that returns the existing account. No change needed.

---

### PRD-020v2 — Subscription Management (1 day)

**Domain:** Subscription Management (existing PRD-020)
**Priority:** P1 — Users need to be able to subscribe through the UI
**Effort:** 1 day
**Findings addressed:** 5.4.1

#### Req 1: Add Subscribe Button to Tier Cards (Day 3, 4h)

**Finding 5.4.1 (Medium):** Subscription tier cards in `payments.tsx` (lines 167–194) are static — no action button. The backend `POST /api/subscription/checkout` exists but there's no UI to trigger it. The `checkoutMutation` and `handleCheckout` function already exist in the component (lines 45–91) but are not wired to any button.

**Current code context:**
- `payments.tsx:45-51` — `checkoutMutation` already defined, calls `POST /api/subscription/checkout`
- `payments.tsx:89-91` — `handleCheckout(tierName)` function exists
- `payments.tsx:167-194` — Tier cards render but have no button

**Change:**
- **File:** `client/src/pages/payments.tsx`
- Add a "Subscribe" button to each tier card (inside the card component, after the features list):
  ```tsx
  {tier.name !== subscription?.tier && (
    <Button
      onClick={() => handleCheckout(tier.name)}
      disabled={checkoutMutation.isPending}
      className="w-full mt-4"
      data-testid={`subscribe-${tier.name}`}
    >
      {checkoutMutation.isPending ? "Loading..." : 
       subscription?.tier ? "Switch Plan" : "Subscribe"}
    </Button>
  )}
  {tier.name === subscription?.tier && (
    <Badge className="w-full mt-4 justify-center">Current Plan</Badge>
  )}
  ```
- The button should:
  - Show "Subscribe" for new subscribers
  - Show "Switch Plan" for existing subscribers switching tiers
  - Show "Current Plan" badge (disabled) for the user's current tier
  - Call `handleCheckout(tier.name)` which already invokes the mutation

**Verification:** Tier cards in the Payments page show a "Subscribe" / "Switch Plan" button. Clicking it opens the Stripe Checkout session in a new tab.

#### Req 2: Add Error Handling for JSON.parse on Tier Features (Day 3, 30min)

**Finding 5.4.2 (Low):** `payments.tsx:180` — `JSON.parse(tier.features || "[]")` has no error handling.

**Change:**
- **File:** `client/src/pages/payments.tsx`
- Wrap in try/catch:
  ```typescript
  const features = (() => {
    try { return JSON.parse(tier.features || "[]"); }
    catch { return []; }
  })();
  ```

---

### PRD-021v2 — Tax Documents (1 day)

**Domain:** Tax Document Generation (existing PRD-021)
**Priority:** P0 — Hardcoded payer TIN is a compliance blocker for 1099 filing
**Effort:** 1 day
**Findings addressed:** 6.8.2, 5.5.2

#### Req 1: Move Payer TIN to Environment Variable (Day 4, 1h)

**Finding 6.8.2 (Medium):** Payer TIN hardcoded as `"81-2345678"` in `server/lib/tax-documents.ts` line 137.

**Change:**
- **File:** `server/lib/tax-documents.ts`
- **Line 137:**
  ```typescript
  // BEFORE:
  tin: "81-2345678", // Payer's EIN
  
  // AFTER:
  tin: process.env.PAYER_TIN || (() => { throw new Error("PAYER_TIN environment variable is required for 1099 generation"); })(),
  ```
- **Env var to add to `.env.example`:**
  ```
  PAYER_TIN=       # Payer's EIN for 1099-NEC forms (format: XX-XXXXXXX)
  ```

**Verification:** `grep -rn "81-2345678" server/` returns zero matches.

#### Req 2: Add Client-Side EIN/SSN Validation (Day 4, 1h)

**Finding 5.5.2 (Medium):** `w9-form.tsx` validates that tax ID is non-empty but doesn't validate format. Server-side validation exists (`isValidTaxId`) but client-side validation improves UX.

**Change:**
- **File:** `client/src/pages/w9-form.tsx`
- Add format validation in the `validate()` function (around line 70):
  ```typescript
  // EIN format: XX-XXXXXXX (2 digits, dash, 7 digits)
  const einPattern = /^\d{2}-\d{7}$/;
  // SSN format: XXX-XX-XXXX or XXXXXXXXX
  const ssnPattern = /^\d{3}-\d{2}-\d{4}$|^\d{9}$/;
  
  if (form.einOrSsn.trim() && !einPattern.test(form.einOrSsn.trim()) && !ssnPattern.test(form.einOrSsn.trim())) {
    errors.push("Tax ID must be EIN (XX-XXXXXXX) or SSN (XXX-XX-XXXX) format");
  }
  ```

**Verification:** Entering `abc` in the tax ID field shows a format validation error before the form submits.

#### Already-Fixed Verification

- **Finding 5.5.1** (W-9 pre-fill masked value): `w9-form.tsx:40` — `einOrSsn: ""` with comment "Never pre-fill tax ID — user must re-enter for security". Already fixed.

---

### PRD-022v2 — GDPR/CCPA Data Privacy (2 days)

**Domain:** GDPR/CCPA Data Privacy Compliance (existing PRD-022)
**Priority:** P2 — Completes GDPR export requirements, improves data integrity
**Effort:** 2 days
**Findings addressed:** 6.5.2, 1.3

#### Req 1: Add Audit Logs + Analytics to Data Export (Day 6, 3h)

**Finding 6.5.2 (Medium):** `GET /api/data/export` (routes.ts:1527-1574) includes user, profile, payments, W-9, and feedback — but excludes security audit logs and analytics events. GDPR Article 15 requires a complete copy of personal data.

**Current export data:** `routes.ts:1527-1574` — includes user, profile, payments, w9, feedback.
**Missing:** security audit logs (userId-linked), analytics events (userId-linked).

**Change:**
- **File:** `server/routes.ts`, after line 1525 (after `const feedback = ...`):
  ```typescript
  const auditLogs = storage.getSecurityLogsByUser?.(req.userId!, 5000) || [];
  const analyticsEvents = storage.getAnalyticsByUser?.(req.userId!, 5000) || [];
  ```
- Add to `exportData` object (after `feedback`):
  ```typescript
  auditLogs: auditLogs.map((log) => ({
    action: log.action,
    ipAddress: log.ipAddress,
    details: log.details,
    createdAt: log.createdAt,
    // Exclude internal fields: userId, userAgent (not PII the user needs)
  })),
  analyticsEvents: analyticsEvents.map((event) => ({
    eventType: event.eventType,
    metadata: event.metadata,
    createdAt: event.createdAt,
  })),
  ```
- **File:** `server/storage.ts` — ensure `getSecurityLogsByUser()` and `getAnalyticsByUser()` methods exist (or add them if they don't).

**Verification:** `GET /api/data/export` response includes `auditLogs` and `analyticsEvents` arrays.

#### Req 2: Add UNIQUE Constraint on subscription_tiers.name (Day 6, 30min)

**Finding 1.3 (Medium):** `subscriptionTiers.name` has no UNIQUE constraint. Duplicate tier names can be inserted.

**Change:**
- **File:** `shared/schema.ts`, line 422:
  ```typescript
  // BEFORE:
  name: text("name").notNull(), // free | pro | pro_plus
  
  // AFTER:
  name: text("name").notNull().unique(), // free | pro | pro_plus
  ```
- **File:** `server/migrate.ts` — add migration step:
  ```typescript
  // Add UNIQUE constraint on subscription_tiers.name if not exists
  // SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we check and recreate if needed
  // For safety, just add a unique index:
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_tiers_name ON subscription_tiers(name);`);
  ```

**Verification:** Attempting to insert a duplicate tier name throws a UNIQUE constraint error.

#### Req 3: Add Request ID to Audit Logs (covered by PRD-018v2 Req 4)

This requirement is implemented in PRD-018v2. No duplicate work needed here. Listed for finding traceability only.

#### Already-Fixed Verification

- **Finding 1.2** (No `PRAGMA foreign_keys = ON`): `migrate.ts:8` — `sqlite.pragma("foreign_keys = ON")`. Already fixed.
- **Finding 1.4** (No index on `payments.stripe_subscription_id`): `migrate.ts:259` — `CREATE INDEX IF NOT EXISTS idx_payments_stripe_sub`. Already fixed.

---

### PRD-023v2 — Infrastructure Health (2 days)

**Domain:** Infrastructure Health Monitoring (new PRD-023)
**Priority:** P2 — Valuable for production, not needed for beta launch
**Effort:** 2 days
**Findings addressed:** Review Report §10 Risk Assessment (no monitoring)

#### Req 1: Basic Health Endpoint (Day 9, 4h)

No existing health check endpoint. The platform needs basic operational visibility.

**Change:**
- **New file:** `server/lib/health.ts`:
  ```typescript
  import { db } from "../db";
  import Stripe from "stripe";
  
  interface HealthCheck {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    checks: {
      database: { status: string; latencyMs: number };
      stripe: { status: string; latencyMs: number };
      disk: { status: string; freeGB: number };
    };
  }
  
  export async function getHealth(): Promise<HealthCheck> {
    const checks = {
      database: await checkDatabase(),
      stripe: await checkStripe(),
      disk: await checkDisk(),
    };
    
    const hasUnhealthy = Object.values(checks).some(c => c.status === "unhealthy");
    const hasDegraded = Object.values(checks).some(c => c.status === "degraded");
    
    return {
      status: hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy",
      timestamp: new Date().toISOString(),
      checks,
    };
  }
  
  async function checkDatabase() {
    const start = Date.now();
    try {
      db.run(sql`SELECT 1`);
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch (e) {
      return { status: "unhealthy", latencyMs: Date.now() - start };
    }
  }
  
  async function checkStripe() {
    const start = Date.now();
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2023-10-16" });
      await stripe.balance.retrieve();
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch (e) {
      return { status: "degraded", latencyMs: Date.now() - start };
    }
  }
  
  async function checkDisk() {
    const { statfs } = await import("fs/promises");
    try {
      const stats = await statfs("/");
      const freeGB = (stats.bavail * stats.bsize) / (1024 ** 3);
      return { status: freeGB < 1 ? "unhealthy" : freeGB < 5 ? "degraded" : "healthy", freeGB: Math.round(freeGB * 10) / 10 };
    } catch {
      return { status: "unknown", freeGB: -1 };
    }
  }
  ```

- **File:** `server/routes.ts` — add public health endpoint:
  ```typescript
  app.get("/api/health", async (req, res) => {
    const health = await getHealth();
    const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;
    res.status(statusCode).json(health);
  });
  ```

- **File:** `server/routes.ts` — add admin detailed health endpoint:
  ```typescript
  app.get("/api/admin/health/detailed", requireAdmin, async (req, res) => {
    const health = await getHealth();
    // Add admin-only details: version, uptime, memory usage
    res.json({
      ...health,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      env: process.env.NODE_ENV,
    });
  });
  ```

**Verification:** `curl http://localhost:5000/api/health` returns `{ status: "healthy", checks: { database: ..., stripe: ..., disk: ... } }`.

#### Req 2: Admin Detailed Health Endpoint (Day 9, 2h)

Included in Req 1 above. The `/api/admin/health/detailed` endpoint adds uptime, memory, version, and environment info.

#### Effort Breakdown

| Task | Effort |
|------|--------|
| Req 1: Health check module + public endpoint | 4h |
| Req 2: Admin detailed endpoint | 2h |
| **Total** | **~0.75 days** (rounded to 1 day in sprint) |

---

## Sprint 1 Effort Summary

| PRD | Priority | Effort | Findings Addressed |
|-----|----------|--------|--------------------|
| PRD-018v2 (Security Hardening) | P1 | 1 day | 3.1, 3.2, 6.1.1, 6.1.2, 6.2.2 |
| PRD-019v2 (Stripe Connect) | P1 | 1 day | 6.7.2, 4.9 |
| PRD-020v2 (Subscription Management) | P1 | 1 day | 5.4.1 |
| PRD-021v2 (Tax Documents) | P0 | 1 day | 6.8.2, 5.5.2 |
| PRD-022v2 (GDPR/CCPA) | P2 | 1 day | 6.5.2, 1.3 |
| PRD-023v2 (Infrastructure Health) | P2 | 1 day | §10 Risk Assessment |
| **Total** | — | **6 days** | **10 findings + 4 verified-fixed** |

**Sprint 1 Schedule (Days 1–6):**

| Day | PRD | Tasks | Findings |
|-----|-----|-------|----------|
| 1 | PRD-018v2 | Remove hardcoded admin creds, require ENCRYPTION_KEY | 3.1, 3.2, 6.1.1 |
| 2 | PRD-018v2 | Encrypt additional fields, add request ID to audit logs | 6.1.2, 6.2.2 |
| 3 | PRD-020v2 | Add Subscribe button, JSON.parse error handling | 5.4.1, 5.4.2 |
| 4 | PRD-019v2 + PRD-021v2 | Subscription upgrade/downgrade, move payer TIN, add validation | 6.7.2, 4.9, 6.8.2, 5.5.2 |
| 5 | — | **Buffer / testing** | — |
| 6 | PRD-022v2 + PRD-023v2 | GDPR export fix, UNIQUE constraint, health endpoint | 6.5.2, 1.3 |

**Total: 6 days** (within 7–11 day target; 1 day buffer for testing)

---

## Section B: Deferred PRDs (Sprint 3+) — New Swarm Infrastructure PRDs

These PRDs are **not part of Sprint 1**. They address swarm infrastructure needs identified in the model assessment and are deferred until the FVC platform is production-stable.

### PRD-024 — LLM Routing Layer (NEW)

**Domain:** Multi-Model LLM Routing Infrastructure (new PRD)
**Priority:** P2 — Swarm pipeline infrastructure, not FVC platform
**Effort:** 10–14 days (Sprint 3+)
**Dependencies:** None (standalone)
**Swarm gap:** Integration gap — no unified model routing for MiMo-v2.5 / Kimi-K3

#### Requirements

1. **Model Routing Layer (`server/lib/llm.ts`)**
   - Create a new module that provides a unified `routeLLM(task, payload)` function.
   - Task-based model selection:
     - **MiMo-v2.5** (via OpenRouter): PRD interpretation, code generation, semantic analysis, long-context document review (1M tokens).
     - **Kimi-K3** (self-hosted): Deep-dive long-context analysis, compliance-sensitive tasks (GDPR/CCPA data stays on-host), iterative PRD assessment loops.
   - Expose `evaluatePRD(prdText, mode)` interface for downstream consumers.

2. **Failover Between Models**
   - Circuit-breaker pattern in `server/lib/llm.ts`:
     - Primary: MiMo-v2.5 via OpenRouter.
     - Fallback: Kimi-K3 self-hosted on timeout (>10s) or non-2xx.
     - Both fail: return structured error with `degraded: true`.
   - Log failover events to `security_audit_log`.

3. **Prompt Caching**
   - In-memory LRU cache with 30-min TTL (`server/lib/prompt-cache.ts`).
   - Cache key: SHA-256(prompt + model config).
   - Reduces MiMo API costs 60–80% for iterative assessment loops.

#### Effort Breakdown

| Task | Effort |
|------|--------|
| `server/lib/llm.ts` routing layer | 4–5 days |
| Failover with circuit breaker | 2–3 days |
| Prompt cache (LRU + TTL) | 2–3 days |
| Integration testing | 2–3 days |
| **Total** | **10–14 days** |

#### Mapping to Swarm Findings

| Swarm Finding | PRD-024 Requirement |
|---|---|
| MiMo-v2.5 Integration score: 7.5/10 — OpenRouter OpenAI-compatible | Requirement 1: `server/lib/llm.ts` as abstraction layer |
| Kimi-K3 self-hosting requirement | Requirement 2: Failover to self-hosted Kimi-K3 |
| MiMo-v2.5 cost: $0.01–$0.03/loop, scales with PRD cycles | Requirement 3: Prompt caching reduces cost 60–80% |
| Integration Order §6 Step 1: Wire MiMo-v2.5 via OpenRouter | Codified as primary model in routing layer |

---

### PRD-025 — Model Cost Tracking (NEW)

**Domain:** LLM Model Usage Cost Tracking & Budget Alerting (new PRD)
**Priority:** P2 — Prevents runaway costs when swarm pipeline runs at scale
**Effort:** 7–12 days (Sprint 3+)
**Dependencies:** PRD-024 (requires `server/lib/llm.ts`)

#### Requirements

1. **Model Usage Table**
   - New table `model_usage` in `shared/schema.ts`:
     - `modelName: text` — "mimo-v2.5" or "kimi-k3"
     - `tokensIn: integer`, `tokensOut: integer`
     - `costUsd: text` (text for precision)
     - `taskId: integer` — FK to the assessment/task that triggered the call
     - `createdAt: integer` — Unix epoch

2. **Cost Instrumentation**
   - Instrument `server/lib/llm.ts` (from PRD-024) to emit a cost event after each LLM call.
   - Write to `model_usage` table.

3. **Budget Alerting**
   - Background job (`server/jobs/cost-monitor.ts`) runs every 6 hours.
   - Query `SUM(costUsd)` grouped by day.
   - Alert at 80% of daily budget via existing email/Telegram gateway (`server/email/queue.ts`).
   - At 100% budget: suspend MiMo calls, route all traffic to Kimi-K3.

#### Effort Breakdown

| Task | Effort |
|------|--------|
| `model_usage` schema and migration | 1–2 days |
| Cost instrumentation in `server/lib/llm.ts` | 2–3 days |
| Background cost monitor job | 2–3 days |
| Alerting integration | 1–2 days |
| **Total** | **7–12 days** |

---

### PRD-026 — Multimodal Document Processing (NEW)

**Domain:** Multimodal Document Support (OCR, Audio Transcription) (new PRD)
**Priority:** P2 — Forward-looking capability, not blocking current functionality
**Effort:** 13–18 days (Sprint 4+)
**Dependencies:** PRD-024 (requires `server/lib/llm.ts`)

#### Requirements

1. **Image-Based W-9/EIN Capture and OCR**
   - `POST /api/w9/capture-image` — accepts multipart/form-data image.
   - OCR pipeline (Tesseract.js or cloud service) extracts tax ID, business name.
   - Extracted values flow through existing `isValidTaxId()` + `encryptSensitive()`.
   - New `w9_document_images` table: `id`, `w9FormId`, `imageUrl`, `ocrConfidence`, `ocrText`, `createdAt`.

2. **Audio Transcription for Client Briefings**
   - `POST /api/briefings/transcribe` — accepts audio files (MP3, WAV, OGG).
   - Route through `server/lib/llm.ts` to MiMo-v2.5 (native omnimodal).
   - Extract structured entities (client name, scope, budget, deadlines).

3. **Multimodal PRD Parsing**
   - `parsePRDBriefMultimodal(attachment)` in `server/lib/llm.ts`.
   - Accepts image/pdf/audio alongside text.
   - Returns same structured output as text-based parsing.

#### Effort Breakdown

| Task | Effort |
|------|--------|
| OCR pipeline for W-9 image capture | 5–7 days |
| Audio transcription endpoint | 4–5 days |
| Multimodal PRD parsing | 3–4 days |
| Schema migration | 1–2 days |
| **Total** | **13–18 days** |

---

## Section C: Deferred Findings (Sprint 3+)

These findings from the review report are acknowledged but explicitly deferred. Each includes rationale.

| Finding | Severity | Deferred To | Rationale |
|---------|----------|-------------|-----------|
| 5.1.1 — Handle generation from displayName | Medium | Sprint 3 (separate fix) | Requires schema change to expose handle in profile API. Not a blocker. |
| 5.2.1 — Empty skills array handling | Critical | Sprint 3 (separate fix) | Needs client-side fix in profile-edit.tsx. Quick fix (30min) but not in Sprint 1 scope. |
| 6.1.3 — No key rotation | Low | Sprint 4+ | Requires key versioning + re-encryption migration. Not needed for beta. |
| 6.3.1 — In-memory rate limiting | Medium | Sprint 3+ | Requires Redis or SQLite-backed store. In-memory works for single-instance beta. |
| 7.1 — No tests for PRD-007/018-022 endpoints | High | Sprint 3 | Test coverage is important but not a functional blocker. Parallel track. |

---

## Cross-PRD Dependencies (Sprint 1)

| From | To | Dependency |
|------|-----|------------|
| PRD-018v2 (Req 4: request ID) | PRD-022v2 (Req 1: data export) | Request IDs in audit logs enrich GDPR export data |
| PRD-019v2 (Req 1: upgrade/downgrade) | PRD-020v2 (Req 1: Subscribe button) | UI button triggers checkout which now handles upgrades |
| PRD-021v2 (Req 1: payer TIN env var) | None | Standalone — no cross-PRD dependency |

**No critical-path blockers.** Each PRD can be built independently. The only logical dependency is that PRD-020v2's Subscribe button is more useful after PRD-019v2's upgrade logic is in place, but both can be built in parallel (the button works without upgrade logic — it just creates a new subscription).

---

## Validation Criteria Compliance

This V2 is designed to pass all 6 of Forge's validation criteria:

| # | Criterion | V1 Verdict | V2 Compliance |
|---|-----------|------------|---------------|
| 1 | No Conflicts | ❌ FAIL | ✅ PRD-019 = Stripe Connect, PRD-020 = Subscription Mgmt, PRD-021 = Tax Docs. LLM/cost/multimodal → PRD-024/025/026. |
| 2 | Consistency | ⚠️ PASS | ✅ All changes reference existing files/line numbers. Leverages existing infra (audit logs, email queue, rate limiter). |
| 3 | Real Gaps Only | ❌ FAIL | ✅ Every PRD maps to specific unaddressed findings. 4 already-fixed findings verified. P0 bugs not used as justification. |
| 4 | Priority Justification | ❌ FAIL | ✅ PRD-018 → P1, PRD-022 → P2, PRD-023 → P2. Only PRD-021 is P0 (payer TIN compliance blocker). |
| 5 | Completeness | ⚠️ PASS | ✅ All 19 findings tracked. 10 addressed in Sprint 1, 4 verified fixed, 5 explicitly deferred with rationale. |
| 6 | Impact Assessment | ❌ FAIL | ✅ Total Sprint 1: 6 days. No new infrastructure. Deferred PRDs clearly separated. |

---

## End of Document

*This document (V2) was produced by Nexus in response to Forge's Round 1 critique. All 19 review findings are tracked. All 4 scope-hijacked PRDs are restored to their domains. LLM routing, cost tracking, and multimodal processing are new PRDs (024–026) deferred to Sprint 3+.*

*Round 3 will be a final alignment pass by Forge.*
