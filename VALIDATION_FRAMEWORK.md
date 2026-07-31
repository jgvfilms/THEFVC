# FORGE: PRD Validation Framework & Checklist

**Role:** Forge (Validation) — Nexys→Forge quality loop for the FVC project
**Prepared:** 2026-07-30
**Workspace:** /opt/data/thefvc-app-source

---

## 1. PRD Implementation Inventory (Extracted from Codebase)

The following PRD markers were extracted from the current codebase. This is the ground truth Nexus's output will be validated against.

### PRDs Marked in routes.ts (32 markers)
| PRD | Marker Count | Routes/Features |
|-----|-------------|-----------------|
| PRD-006 | 1 | Crew Finder Pagination (`/api/profiles/paginated`) |
| PRD-007 | 8 | Payments, subscriptions, W-9, tier management, tax export |
| PRD-009 | 1 | Notifications API (`/api/notifications/*`) |
| PRD-010 | 2 | Legal & Compliance (security log, blocked IPs) |
| PRD-011 | 4 | Account & Settings (password reset, email verification) |
| PRD-013 | 1 | Email Infrastructure (`/api/email/stats`) |
| PRD-015 | 3 | Reporting & Analytics (`/api/analytics/*`) |
| PRD-018 | 14 | Security hardening (rate limiting, audit logging, encryption, foreign keys, indexes) |
| PRD-019 | 5 | Stripe Connect (checkout session, webhook, connect account, idempotency) |
| PRD-020 | 1 | Subscription Management (`/api/subscription/*`) |
| PRD-021 | 3 | Tax Document Generation (1099 forms, eligibility, export) |
| PRD-022 | 5 | GDPR/CCPA (data export, data deletion, cookie consent) |

### PRDs Marked in storage.ts
| PRD | Marker Count | Storage Features |
|-----|-------------|-----------------|
| PRD-006 | 1 | `searchProfilesPaginated` method |
| PRD-007 | 3 | Subscription tiers, payments, W-9 forms |
| PRD-009 | 1 | Notification CRUD operations |
| PRD-019 | 2 | Stripe Connect profile lookups by account/customer ID |

### PRDs Marked in schema.ts
| PRD | Marker Count | Schema Features |
|-----|-------------|-----------------|
| PRD-007 | 4 | subscription_tiers, payments, w9_forms, profile subscription columns |
| PRD-009 | 1 | notifications table |
| PRD-010 | 2 | security_audit_log, blocked_ips |
| PRD-011 | 2 | password_resets, email_verifications |
| PRD-013 | 1 | email_queue |
| PRD-015 | 1 | analytics_events |

### PRDs Marked in migrate.ts
| PRD | Marker Count | Migration Features |
|-----|-------------|-------------------|
| PRD-007 | 3 | Subscription columns, tables, indexes |
| PRD-018 | 3 | Foreign keys, subscription columns, performance indexes |

### PRDs in Other Files
| PRD | File | Feature |
|-----|------|---------|
| PRD-008 | tests/* (all 7 test files) | Testing & CI (E2E + unit + API tests) |
| PRD-014 | client/src/components/shared/index.tsx | Shared Components barrel export |
| PRD-012 | client/src/components/bottom-tab-bar.tsx, client/src/pages/layout.tsx | Mobile-First UX (bottom tab bar) |

### MISSING PRDs (No Markers in Codebase)
| PRD | Status |
|-----|--------|
| PRD-012 | ⚠️ Client-side only (bottom-tab-bar, layout.tsx). No server markers. |
| PRD-014 | ⚠️ Client-side only (shared/index.tsx barrel export). No server markers. |
| PRD-016 | ❌ No markers found anywhere in the codebase. |
| PRD-017 | ❌ No markers found anywhere in the codebase. |

---

## 2. PRD-006 through PRD-022 Implementation Verification

| PRD | Status | Evidence | Risk |
|-----|--------|----------|------|
| PRD-006 | ✅ Implemented | `searchProfilesPaginated` in storage.ts + `/api/profiles/paginated` route + route marker | Low |
| PRD-007 | ✅ Implemented | Subscription tiers, payments, W-9 tables + routes + storage + schema. 8 route markers, 3 storage markers, 4 schema markers | Low |
| PRD-008 | ✅ Implemented | 7 test files all reference PRD-008. Playwright + Vitest configs marked | Low |
| PRD-012 | ⚠️ Partial | Client-side only (bottom tab bar, layout). No server-side feature or markers | Medium |
| PRD-014 | ⚠️ Partial | Client-side only (shared barrel export). No server-side feature | Medium |
| PRD-016 | ❌ Not Found | No markers, no implementation, no test coverage anywhere | HIGH |
| PRD-017 | ❌ Not Found | No markers, no implementation, no test coverage anywhere | HIGH |
| PRD-018 | ✅ Implemented | 14 route markers, 3 migrate markers, encryption lib, rate limiting, audit logging | Low — but 5 P0 bugs fixed in commit 7ba16e5 |
| PRD-019 | ✅ Implemented | Stripe Connect routes + storage lookups + webhook. 5 route markers | Low — but idempotency was a P0 fix in 7ba16e5 |
| PRD-020 | ✅ Implemented | Subscription management routes (`/api/subscription/*`) + `updateProfileSubscription` | Low |
| PRD-021 | ✅ Implemented | 1099 form generation routes + `tax-documents.ts` lib. 3 route markers | Low |
| PRD-022 | ✅ Implemented | Data export, data deletion, cookie consent routes. 5 route markers | Low |

---

## 3. Sprint 5 Review Report Cross-Reference

The Sprint 5 review report (411 lines) documents 30+ findings. Below are the **unresolved items** (medium/low severity) and their cross-reference against PRD claims:

### Unresolved Medium/High Items from the Review Report

| # | Severity | Finding | PRD Impact | Still Open? |
|---|----------|---------|------------|-------------|
| 4.1 | **Critical** | Password reset `{ password: ... }` → should be `{ passwordHash: ... }` | PRD-011 (Account & Settings) | ⚠️ Check commit 7ba16e5 — likely fixed |
| 4.2 | **Critical** | Email templates called with strings instead of context objects | PRD-011 | ⚠️ Check commit 7ba16e5 — likely fixed |
| 4.3 | **High** | Tax export returns encrypted tax IDs | PRD-018 | ⚠️ Check commit 7ba16e5 — likely fixed |
| 4.4 | **High** | Tax export `email` field logic bug (`profile?.userId ? "" : ""` always returns "") | PRD-007 | ⚠️ Check commit 7ba16e5 — likely fixed |
| 2.1 | **High** | SQL LIKE injection in `searchProfilesPaginated` | PRD-006 | ⚠️ May still be open |
| 2.3 | **Low** | Count query in paginated search missing skill filter | PRD-006 | ⚠️ May still be open |
| 4.7 | **Medium** | Stripe Connect account creation has no idempotency check | PRD-019 | ⚠️ Check commit 7ba16e5 — likely fixed |
| 3.1 | **High** | Hardcoded admin password in migration | PRD-018 | ⚠️ May still be open |
| 3.2 | **Medium** | Hardcoded admin email in migration | PRD-018 | ⚠️ May still be open |
| 2.4 | **Low** | `getProfileByHandle` doesn't check `isPublic` | PRD-018 | ⚠️ May still be open |
| 2.2 | **Medium** | `sortBy` not validated against whitelist | PRD-006 | ⚠️ May still be open |
| 4.10 | **Low** | Admin W-9 view returns encrypted tax IDs | PRD-018 | ⚠️ May still be open |

### Key Discrepancies Between PRD Claims and Sprint 5 Report

1. **PRD-018 claims "Security & Compliance Hardening" is implemented**, but the report shows active critical bugs in its features (password reset, tax ID encryption leakage, audit log gaps). The PRD marker count (14) does not equal production-readiness.

2. **PRD-006 claims "Crew Finder Pagination" is implemented**, but the report identifies SQL LIKE injection and a broken count query — suggesting the feature is implemented but not securely. The PRD marker count doesn't capture security quality.

3. **PRD-019 claims "Stripe Connect Production Integration"**, but the report flags missing idempotency checks (commit 7ba16e5 may have fixed this — needs verification).

4. **PRD-008 claims "Testing & CI"** but the report notes missing comprehensive test coverage for new PRD-007 and PRD-018-022 endpoints. E2E tests at 92 lines for crew-finder use `waitForTimeout` flakily.

5. **PRD-016 and PRD-017 do not appear** in the PRD inventory (see Section 1 above). If Nexus proposes changes claiming to address these, that's a new feature, not a PRD update.

---

## 4. FVC Model Assessment Summary

From `/opt/data/thefvc-app-source/FVC_MODEL_ASSESSMENT.md`:

### Key Findings
- **MiMo-v2.5**: 8.2/10 — best for PRD assessment loops via OpenRouter ($0.01-0.03/cycle, 1M token context)
- **Kimi-K3**: 7.0/10 — self-hosted, Modified MIT license, 1M native context
- **Recommendation**: MiMo-v2.5 as primary, Kimi-K3 as failover/self-hosted option
- **Swarm gaps**: Neither model fills Security Sentinel, Data Pipeline Engineer, or Infrastructure Health Watchdog — needs dedicated tooling

### Priority Implications for PRD Updates
- PRD-022 (GDPR/CCPA) recommended as the initial pilot PRD for MiMo-v2.5
- PRD-018 (Security Hardening) is the highest-impact PRD for quality loops
- Model assessment does NOT justify priority changes to existing PRDs — the swarm scores are about the build pipeline, not the PRD content

---

## 5. Validation Checklist for Nexus PRD Output

The following 4-part checklist will be applied to every PRD update Nexus produces. Each item must be explicitly addressed (✅ or ❌ with justification).

### 5.1 Conflict Check — Does the proposed PRD change conflict with existing implementation?

- [ ] **5.1.1** No duplicate route definitions: Proposed new routes don't collide with existing routes in `/opt/data/thefvc-app-source/server/routes.ts`
- [ ] **5.1.2** No schema conflicts: Proposed schema changes don't conflict with existing columns/tables in `/opt/data/thefvc-app-source/shared/schema.ts`
- [ ] **5.1.3** No storage method conflicts: Proposed storage methods don't duplicate or contradict existing methods in `/opt/data/thefvc-app-source/server/storage.ts`
- [ ] **5.1.4** No migration conflicts: Proposed migration changes are compatible with existing idempotent migration pattern in `/opt/data/thefvc-app-source/server/migrate.ts`
- [ ] **5.1.5** PRD marker consistency: The proposed change uses the correct PRD marker comment format (e.g., `// PRD-XXX:` or `// ===== PRD-XXX: =====`) consistent with existing convention
- [ ] **5.1.6** No regression on fixed P0 bugs: The proposed change doesn't reintroduce any of the 5 bugs fixed in commit 7ba16e5 (password reset field mismatch, email template args, tax ID encryption leakage, SQL LIKE injection, Stripe idempotency)

### 5.2 Architecture Consistency Check — Is the proposed PRD change consistent with the codebase architecture?

- [ ] **5.2.1** Follows the route-handler pattern: New route handlers use `requireAuth`, `requireAdmin` middleware where appropriate, try/catch error wrapping, and consistent response shapes (`{ error: string }` for errors)
- [ ] **5.2.2** Uses storage layer pattern: All database operations go through `storage.*` methods, not raw Drizzle queries in route handlers (the one exception is the `seed` endpoint for dev-only)
- [ ] **5.2.3** Schema-first approach: Any new data fields are added to `shared/schema.ts` Drizzle table definitions before being used in storage/routes
- [ ] **5.2.4** Encryption handled at application layer: Sensitive PII (tax IDs, etc.) uses `encryptSensitive()`/`decryptSensitive()` from `server/lib/encryption.ts`, never stored in plaintext
- [ ] **5.2.5** Audit logging for sensitive operations: All endpoints accessing PII, payment data, or admin functionality include `storage.createSecurityLog()` calls with action, IP, user-agent, and success flag
- [ ] **5.2.6** Rate limiting applied: Payment, tax, and auth endpoints have rate limiting middleware (PRD-018 pattern)
- [ ] **5.2.7** TypeScript matches existing patterns: Uses AuthedRequest type, proper typing for all request/response bodies, and no `any` casts unless justified
- [ ] **5.2.8** Client-server consistency: If a feature spans client and server, both sides have corresponding PRD markers and implementation

### 5.3 Gap Analysis — Does the proposed PRD change address a real gap, not a hypothetical?

- [ ] **5.3.1** Grounded in Sprint 5 review report: The proposed change addresses at least one finding from `/opt/data/thefvc-app-source/REVIEW_REPORT_SPRINT5_PRD018_022.md` (see Section 3 above for the unresolved items list)
- [ ] **5.3.2** Not redundant with PRD-018 hardening: The proposed change doesn't duplicate scope already covered by PRD-018 (rate limiting, audit logging, encryption, foreign keys, indexes, security headers)
- [ ] **5.3.3** Addresses a confirmed bug from commit 7ba16e5 or an open finding: If it claims to fix a bug, it references the specific bug in the review report (Section 9 Critical Bugs or Section 11 Recommendations)
- [ ] **5.3.4** Priority justified: If claiming a priority level (P0/P1/P2), the justification references the swarm assessment findings in `FVC_MODEL_ASSESSMENT.md` or the review report's severity ratings
- [ ] **5.3.5** No speculative scope creep: The proposed change doesn't introduce PRD-016 or PRD-017 features (which have no existing implementation or markers) without explicit justification that these are NEW PRDs
- [ ] **5.3.6** Tested by existing tests or proposes new tests: The change is covered by `/opt/data/thefvc-app-source/tests/api/routes.test.ts` or `/opt/data/thefvc-app-source/tests/e2e/*.spec.ts`, or the proposal includes test additions

### 5.4 Priority Justification Check — Is the priority level justified by the swarm findings?

- [ ] **5.4.1** P0 claims: Must reference a finding from Section 9 (Critical Bugs) of the Sprint 5 review report — e.g., password reset bug, broken email templates, encrypted tax IDs in export
- [ ] **5.4.2** P1 claims: Must reference a finding from Section 11 (Short-Term Recommendations) — e.g., SQL LIKE injection, count query skill filter, email field logic bug
- [ ] **5.4.3** P2/Medium claims: Must reference Section 3 or 4 findings (schema/storage/migration issues) or the model assessment findings
- [ ] **5.4.4** P3/Low claims: Must reference Section 5, 6, 7, or 8 client-side/Infrastructure/low-severity findings
- [ ] **5.4.5** MiMo-v2.5 priority alignment: If proposing MiMo-v2.5-specific changes (e.g., PRD-022 as pilot), priority must be justified by the MiMo-v2.5 fit score (8.2/10) and the model assessment's integration order (Section 6)
- [ ] **5.4.6** No inflation: Priority level isn't inflated simply because the model assessment mentions it — priority must match the severity rating in the review report

---

## 6. Validation Execution Procedure

When Nexus produces its PRD update specifications, forge will execute:

1. **Extract** Nexus's proposed changes and PRD markers
2. **Diff** against the baseline commits:
   - `67270f1` (Sprint 5 baseline) — for implementation context
   - `7ba16e5` (P0 bug fixes) — for bug-fix context
   - `d9da91e` (model assessment) — for model evaluation context
3. **Check** each of the 28 checklist items in Section 5 (5.1–5.4)
4. **Flag** any item that fails with the specific rule number and evidence path
5. **Produce** a validation verdict: ✅ PASS (all items pass), ⚠️ CONDITIONAL (items pass with minor concerns to document), ❌ FAIL (any critical item fails)

---

## 7. Files Referenced

| File | Purpose |
|------|---------|
| `server/routes.ts` | Primary source of PRD markers (32 markers), route implementations |
| `server/storage.ts` | Storage layer methods, IStorage interface, PRD markers |
| `server/migrate.ts` | Migration script, PRD-018 foreign keys/indexes, PRD-007 columns |
| `shared/schema.ts` | Drizzle schema definitions, PRD-007/009/010/011/013/015 markers |
| `server/index.ts` | WebSocket server (PRD-009 marker) |
| `server/lib/encryption.ts` | Encryption utilities (PRD-018 marker) |
| `server/lib/stripe.ts` | Stripe Connect integration (PRD-019 marker) |
| `server/lib/tax-documents.ts` | 1099 form generation (PRD-021 marker) |
| `REVIEW_REPORT_SPRINT5_PRD018_022.md` | Sprint 5 review — 411 lines of findings |
| `FVC_MODEL_ASSESSMENT.md` | MiMo-v2.5 vs Kimi-K3 swarm comparison |
| `MIMOV25_ASSESSMENT.md` | MiMo-v2.5 detailed assessment (separate file) |

---

## 8. Issues Encountered

1. **PRD-016 and PRD-017 are completely absent** from the codebase — no markers, no implementation, no test coverage. If Nexus proposes changes for these, they would be NEW PRDs, not updates to existing ones. This should be flagged.

2. **PRD-012 and PRD-014 are client-only** — they have no server-side markers or implementations. Any PRD update claiming to extend these must address the server/client boundary.

3. **Some Sprint 5 P0 bugs may have been fixed** in commit 7ba16e5 (the review report predates the fix commit). The validation should check whether the current code at HEAD still has these bugs or not, then adjust the checklist accordingly.

4. `storage.ts` and `routes.ts` are large (743 and 1674 lines respectively) — the middle portions were truncated during reads but all PRD markers were confirmed via grep.
