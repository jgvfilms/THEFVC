# PRD Update Validation Checklist

**Purpose:** Checklist and validation framework for Nexus PRD update specs (PRD-018 through PRD-022 + PRD-023).
**Forge Role:** Prepare framework; validate Nexus output when it arrives at `PRD_UPDATES_FROM_SWARM.md`.
**Last Updated:** 2026-07-30

---

## Reference Documents

| Document | Path | Lines |
|----------|------|-------|
| Sprint 5 Review Report | `REVIEW_REPORT_SPRINT5_PRD018_022.md` | 411 |
| Model Assessment | `FVC_MODEL_ASSESSMENT.md` | 143 |
| Source: routes.ts | `server/routes.ts` | 1,674 |
| Source: storage.ts | `server/storage.ts` | 743 |
| Source: schema.ts | `shared/schema.ts` | 475 |
| Source: migrate.ts | `server/migrate.ts` | 377 |
| Source: encryption.ts | `server/lib/encryption.ts` | 100 |
| Source: stripe.ts | `server/lib/stripe.ts` | 256 |
| Source: tax-documents.ts | `server/lib/tax-documents.ts` | 220 |
| Source: templates.ts | `server/email/templates.ts` | 128 |

## PRD Markers in Codebase

The following PRD markers exist in source files and define the current implementation boundary:

| PRD | Marker Pattern | Files |
|-----|---------------|-------|
| PRD-006 | `PRD-006` | routes.ts, storage.ts, schema.ts |
| PRD-007 | `PRD-007` | routes.ts, storage.ts, schema.ts, migrate.ts |
| PRD-008 | (no explicit marker — testing/CI) | — |
| PRD-009 | `PRD-009` | routes.ts, storage.ts, schema.ts |
| PRD-010 | `PRD-010` | routes.ts, schema.ts |
| PRD-011 | `PRD-011` | routes.ts, schema.ts |
| PRD-013 | `PRD-013` | routes.ts |
| PRD-015 | `PRD-015` | routes.ts |
| PRD-018 | `PRD-018` | routes.ts, storage.ts, schema.ts, migrate.ts, encryption.ts, lib/stripe.ts, lib/tax-documents.ts |
| PRD-019 | `PRD-019` | routes.ts, storage.ts, lib/stripe.ts |
| PRD-020 | `PRD-020` | routes.ts, schema.ts |
| PRD-021 | `PRD-021` | lib/tax-documents.ts |
| PRD-022 | `PRD-022` | routes.ts |

## Validation Criteria

### 1. NO CONFLICTS
**Check:** Do proposed PRD changes conflict with existing implementation?

**Method:**
- Read PRD markers in `routes.ts`, `storage.ts`, `schema.ts`, `migrate.ts` to identify what each PRD already implements
- Compare proposed changes against these existing implementations
- Flag any proposed change that:
  - Contradicts existing code logic (e.g., proposes removing a field that exists)
  - Creates duplicate route handlers for existing endpoints
  - Changes schema fields that would break existing queries
  - Removes migration steps already applied to the database
  - Changes encryption/validation logic that's already in place

**Known Implementation Boundaries (from codebase scan):**
- PRD-018: Rate limiting (global + auth-specific), audit logging (all sensitive endpoints), CSP headers, input sanitization, encryption at rest (W-9 tax IDs), `security_audit_log` and `analytics_events` tables
- PRD-019: Real Stripe Connect (`createStripeConnectAccount`, `createAccountLink`, `createPaymentIntent`, `handleStripeWebhook`), idempotency check for duplicate accounts, webhook signature verification
- PRD-020: Subscription management endpoints (`GET /api/subscription`, `POST /api/subscription/checkout`, `POST /api/subscription/cancel`), `subscription_tiers` and `payments` tables with Stripe IDs
- PRD-021: 1099 form JSON data structure generation, `generate1099NECData()` function with tax year filtering, payer TIN placeholder
- PRD-022: GDPR/CCPA data export (`GET /api/data/export`), data deletion (`DELETE /api/data/delete`) with soft-delete (revoked access + anonymized email), cookie consent endpoint (`POST /api/consent/cookie`)

### 2. CONSISTENCY
**Check:** Are all proposed changes consistent with existing architecture?

**Architecture Standards:**
- **Runtime:** Node.js with Express
- **Language:** TypeScript with strict typing
- **ORM:** Drizzle ORM with SQLite backend
- **API Pattern:** RESTful Express route handlers with typed `Request<AuthedRequest>` and `Response` params
- **Database:** SQLite with idempotent migrations in `server/migrate.ts` (uses `PRAGMA table_info` checks)
- **Security:** Rate limiting middleware (in-memory Map store), CSP headers, input sanitization, auth middleware with JWT
- **Auth:** `requireAuth` middleware, `AuthedRequest` type with `userId` and `user` properties
- **Error Handling:** Try/catch blocks in all route handlers returning `{ error: string }` JSON
- **Audit Logging:** `storage.createSecurityLog(...)` calls for all sensitive operations
- **Email:** `queueEmail()` from `./email/queue` with template functions from `./email/templates`
- **Encryption:** `encryptSensitive()`, `decryptSensitive()`, `maskTaxId()` from `./lib/encryption`
- **Stripe:** `Stripe` SDK via `./lib/stripe` with environment-based key configuration

**Flag inconsistencies:**
- Pattern breaks (e.g., not using `requireAuth` for protected routes)
- Different response format than rest of codebase
- Missing error handling
- Missing audit logging for sensitive operations
- Different database access pattern (bypassing storage layer)
- Missing TypeScript types or `as any` casts not documented

### 3. REAL GAPS ONLY
**Check:** Does each proposed change address a gap found by swarm assessment?

**Source Documents for Gap References:**
- `FVC_MODEL_ASSESSMENT.md` — Swarm-identified gaps in Security Sentinel, Data Pipeline, Infrastructure Watchdog
- `REVIEW_REPORT_SPRINT5_PRD018_022.md` — 411-line review with specific findings per PRD

**Every proposed change MUST reference a specific finding number from either document.**

**Key Swarm Gaps (from FVC_MODEL_ASSESSMENT.md):**
1. No vulnerability scanning agent (Security Sentinel gap)
2. No ETL / data freshness monitoring (Data Pipeline gap)
3. No proactive infrastructure monitoring (Infrastructure Watchdog gap)

**Key Review Findings (from REVIEW_REPORT_SPRINT5):**
- **P0:** Password reset bug (finding 4.1), Email template args (finding 4.2), Tax export encrypted IDs (finding 4.3), 1099 encrypted TINs (finding 6.8.1)
- **P1:** SQL LIKE injection (finding 2.1), Count query missing skill filter (finding 2.3), Email logic bug in tax-export (finding 4.4), W-9 pre-fill masked ID (finding 5.5.1)
- **P1:** Hardcoded encryption key (finding 6.1.1), In-memory rate limiting (finding 6.3.1), No auth endpoint rate limiting (finding 6.3.2)
- **P1:** Payer TIN hardcoded (finding 6.8.2), No PDF generation (finding 6.8.3), No subscription upgrade/downgrade (finding 6.7.2)
- **P2:** Missing tests (finding 7.1), No CSP nonce (finding 6.4.2), No key rotation (finding 6.1.3), Missing security audit logs in export (finding 6.5.2)
- **Low:** Schema FK enforcement, UNIQUE constraints, migration version tracking

**Hypothetical changes (not referencing any finding) = FAIL**

### 4. PRIORITY JUSTIFICATION
**Check:** Are P0/P1/P2 labels justified?

| Priority | Valid Use Cases | Invalid Use Cases |
|----------|----------------|-------------------|
| **P0** | Security/compliance blockers (data leakage, broken auth, broken password reset, encrypted data in exports) | Feature requests, UX improvements, cosmetic fixes |
| **P1** | Features that directly address swarm-identified gaps or review findings | Nice-to-haves, future work, refactoring |
| **P2** | Nice-to-haves, future work, quality-of-life improvements | Bug fixes (those should be P0 or P1), security issues (those should be P0) |

**Flag:** Any security/compliance blocker labeled P1 or P2; any feature labeled P0.

### 5. COMPLETENESS
**Check:** Are all PRDs covered?

**Required PRDs in proposed updates:**
1. ✅ PRD-018 (Security & Compliance Hardening)
2. ✅ PRD-019 (Stripe Connect Production Integration)
3. ✅ PRD-020 (Subscription Management)
4. ✅ PRD-021 (Tax Document Generation / 1099)
5. ✅ PRD-022 (GDPR/CCPA Data Privacy)
6. ✅ PRD-023 (NEW — must be included and justified)

**Flag:** Any missing PRD from the active set (018–022). Missing PRD-023 is expected only if Nexus didn't produce one.

### 6. IMPACT ASSESSMENT
**Check:** Do estimated effort ranges make sense?

**Codebase Scale Reference:**
- Total TypeScript LOC across `server/` + `shared/` + `client/src/`: ~15,700 lines
- Core backend (`server/` + `shared/`): ~6,100 lines
- `routes.ts`: 1,674 lines (largest single file)
- `storage.ts`: 743 lines
- `schema.ts`: 475 lines
- `migrate.ts`: 377 lines

**Effort Sanity Checks:**
- PRD-018 updates (security hardening): 2–5 hours (mostly config/env changes, small logic fixes)
- PRD-019 updates (Stripe Connect): 4–8 hours (integration logic, webhook handling)
- PRD-020 updates (subscriptions): 4–8 hours (endpoint additions, UI integration)
- PRD-021 updates (tax docs): 3–6 hours (generation logic, PDF addition)
- PRD-022 updates (GDPR): 3–5 hours (endpoint additions, data handling)
- PRD-023 updates (new): 8–20 hours (depends on scope — should be scoped carefully)

**Flag:** Effort estimates that are off by >2x from above ranges for similar-scope changes, or estimates that don't account for testing.

---

## Validation Process

1. **Wait for Nexus output** at `/opt/data/thefvc-app-source/PRD_UPDATES_FROM_SWARM.md`
2. **For each criterion (1–6):**
   a. Parse Nexus proposals
   b. Cross-reference against codebase (for criteria 1, 2)
   c. Cross-reference against findings (for criteria 3, 4)
   d. Check PRD coverage (for criterion 5)
   e. Check effort estimates (for criterion 6)
3. **Rate each criterion:** `PASS` | `FAIL` | `CONDITIONAL`
4. **Produce report** at `/opt/data/thefvc-app-source/PRD_UPDATES_VALIDATION.md`
5. **Go/No-Go Decision:**
   - `PASS` on all 6 criteria → **GO**
   - `FAIL` on any critical criterion (1, 3, 5) → **NO-GO** (must fix proposals)
   - `FAIL` on consistency/impact only → **CONDITIONAL GO** (fix before implementation)
   - `CONDITIONAL` on any criterion → **CONDITIONAL** (needs clarification)
