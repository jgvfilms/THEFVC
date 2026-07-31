# PRD Update Specifications — From Swarm Assessment Findings

**Document:** PRD Updates Derived from FVC Swarm Model Assessment
**Date:** 2026-07-30
**Source:** `FVC_MODEL_ASSESSMENT.md`, `REVIEW_REPORT_SPRINT5_PRD018_022.md`
**Author:** Nexus (FVC Swarm Pipeline)
**Status:** Design Spec — No Code Changes

---

## Summary of Changes

This document specifies updates to 5 existing PRDs (018–022) and introduces 1 new PRD (023), all derived from gaps identified in the swarm model assessment. Each PRD update includes: **(a) what to add/modify**, **(b) priority**, **(c) estimated effort**, and **(d) mapping to swarm assessment findings**.

---

## PRD-018 — Security & Compliance Hardening

### What to Add/Modify

Update PRD-018 to incorporate **Security Sentinel Agent** requirements. The swarm audit (Section 5, Gap Analysis) identified that neither MiMo-v2.5 nor Kimi-K3 serves as a vulnerability scanning agent, and no automated security pipeline exists.

1. **Automated Code-Level Vulnerability Scanning in CI**
   - Integrate SAST/DAST tooling (semgrep, npm audit, Snyk) into the CI pipeline so that every PR triggers automated vulnerability scans before merge.
   - Add GitHub Actions or equivalent CI step that runs `semgrep --config auto` and `npm audit --audit-level=moderate` on every push to `main` and on pull requests.
   - Define scan rulesets covering: SQL injection, XSS, hardcoded secrets, dependency vulnerabilities, insecure crypto (e.g., the hardcoded `ENCRYPTION_KEY` default found in `encryption.ts`).

2. **Adversarial Output Testing for PRD Interpretation**
   - Create a test harness that feeds adversarial/malformed PRD interpretations to the LLM pipeline and validates outputs don't contain injection, prompt-leakage, or hallucinated compliance claims.
   - Test cases: prompt injection via PRD metadata fields, crafted inputs that attempt to bypass rate limiting or auth checks, encoded payloads in W-9/tax fields.

3. **Compliance Gap Analysis Automation**
   - Implement a compliance-as-code module (`server/lib/compliance-audit.ts`) that programmatically checks the codebase against PRD-018 requirements: encryption coverage, audit log completeness, rate limiting coverage, data retention enforcement, access control.
   - Run this as a CI gate alongside the SAST scans.

4. **Evidence from P0 Bugs Fixed (commit 7ba16e5)**
   - The 5 P0 bugs fixed in Sprint 5 (password reset field mismatch, email template args, tax ID encryption leakage, SQL LIKE injection, Stripe idempotency) all prove that **manual review misses critical security issues**. A Security Sentinel agent would have caught these in CI, not in a human code review pass.
   - Reference each of the 5 bugs as justification for automated scanning:
     - `routes.ts:954` — wrong field name (`password` vs `passwordHash`) → SAST can detect mismatched schema field accesses.
     - `routes.ts:922,990` — wrong argument types to template functions → type-aware linting catches this.
     - `routes.ts:1456` and `tax-documents.ts:107` — encrypted tax IDs leaking into exports → compliance gap tool should detect that `encryptSensitive` output is used without `decryptSensitive` in export paths.
     - `storage.ts:695-708` — unsanitized LIKE patterns → SAST rules for SQL injection cover this.
     - Stripe idempotency gap → CI checklist should verify idempotency keys on all payment endpoints.

### Priority

**P0** — Security scanning is a foundational requirement. Without it, the remaining gaps (SQL injection, hardcoded keys, encrypted data leaks) will reoccur in future PRs.

### Estimated Effort

- SAST/DAST CI integration: 3–5 days
- Adversarial output test harness: 3–4 days
- Compliance gap automation: 4–5 days
- **Total: ~10–14 days**

### Mapping to Swarm Findings

| Swarm Finding | PRD-018 Update |
|---|---|
| Gap Analysis §5: Security Sentinel gap — no vulnerability scanning agent | Requirement 1: Automated SAST/DAST in CI |
| MiMo-v2.5 Security Sentinel score: 6.5/10 — complementary only | Requirement 2: Adversarial testing validates LLM outputs don't introduce security regressions |
| P0 bugs fixed in commit 7ba16e5 prove manual review misses issues | Requirements 1–3 justified by evidence these bugs would have been caught by automation |
| Encryption key hardcoded (Sprint 5 finding 6.1.1) | Compliance gap tool checks for hardcoded secrets and fallback encryption keys |
| SQL LIKE injection (Sprint 5 finding 2.1) | SAST ruleset includes SQL injection patterns |
| Tax ID encryption leakage (Sprint 5 findings 4.3, 4.4, 6.8.1) | Compliance gap tool detects `encryptSensitive` values in export/output paths without `decryptSensitive` |

---

## PRD-019 — Stripe Connect

### What to Add/Modify

Update PRD-019 to incorporate **Multi-Model Routing Infrastructure**. The swarm assessment found both MiMo-v2.5 and Kimi-K3 available via LiteLLM proxy, and the FVC pipeline needs a model routing layer to leverage both for PRD assessment and related tasks.

1. **Model Routing Layer (`server/lib/llm.ts`)**
   - Create a new module `server/lib/llm.ts` that provides a unified `routeLLM(task, payload)` function.
   - The router selects the optimal model based on task type:
     - **MiMo-v2.5** (via OpenRouter): PRD interpretation, code generation, semantic analysis, long-context document review (1M tokens).
     - **Kimi-K3** (self-hosted): Deep-dive long-context analysis, compliance-sensitive tasks where data must not leave the host (GDPR/CCPA), iterative PRD assessment loops that run many times per hour.
   - The abstraction layer exposes a single `evaluatePRD(prdText, mode)` interface so downstream consumers don't need to know which model is being used.

2. **Failover Between MiMo-v2.5 and Kimi-K3**
   - Implement a circuit-breaker pattern in `server/lib/llm.ts`:
     - Primary: MiMo-v2.5 via OpenRouter.
     - If OpenRouter returns a non-2xx error or times out (>10s), automatically fall back to Kimi-K3 self-hosted instance.
     - If both fail, return a structured error with a `degraded: true` flag rather than crashing the pipeline.
   - Track failover events in `security_audit_log` for operational visibility.

3. **Prompt Caching Strategy for Iterative PRD Assessment Loops**
   - Implement a prompt cache (`server/lib/prompt-cache.ts`) using an in-memory Map with TTL (default 30 minutes) and an LRU eviction policy.
   - Cache key: SHA-256 of the concatenated prompt + model selection configuration.
   - Cache hit returns the previous model response, bypassing the LLM call entirely.
   - This reduces MiMo-v2.5 API costs by 60–80% for iterative assessment loops where the same PRD is re-evaluated multiple times (per the swarm risk assessment: "MiMo-v2.5 cost could scale with many PRD cycles").

### Priority

**P1** — Multi-model routing is important for pipeline resilience and cost optimization, but the system currently functions (slowly) with manual model selection. This upgrade enables the iterative assessment loops needed for Sprint 6+.

### Estimated Effort

- `server/lib/llm.ts` routing layer: 4–5 days
- Failover with circuit breaker: 2–3 days
- Prompt cache with TTL/LRU: 2–3 days
- Integration testing and failover validation: 2–3 days
- **Total: ~10–14 days**

### Mapping to Swarm Findings

| Swarm Finding | PRD-019 Update |
|---|---|
| MiMo-v2.5 Integration score: 7.5/10 — OpenRouter is OpenAI-compatible, greenfield for LLM abstraction | Requirement 1: Create `server/lib/llm.ts` as the abstraction layer |
| Kimi-K3 requires self-hosting infrastructure | Requirement 2: Failover to self-hosted Kimi-K3 when OpenRouter is unavailable |
| MiMo-v2.5 cost: $0.01–$0.03/loop; cost could scale with many PRD cycles | Requirement 3: Prompt caching reduces cost 60–80% for iterative loops |
| Integration Order §6 (Step 1): Wire MiMo-v2.5 via OpenRouter as primary | Step 1 of the integration order is now codified as PRD-019 spec |
| Kimi-K3 as failover/self-hosted option (Step 3 of integration order) | Step 3 is codified as the failover mechanism in Requirement 2 |
| FVC_MODEL_ASSESSMENT.md §6 recommends `server/lib/llm.ts` as the integration point | This document maps that recommendation into a concrete PRD spec |

---

## PRD-020 — Subscription Management

### What to Add/Modify

Update PRD-020 to incorporate **Model-Assessment-as-a-Service Pricing Tiers**. The swarm assessment found that MiMo-v2.5 incurs per-assessment-loop costs ($0.01–$0.03) while Kimi-K3 is free when self-hosted. The FVC platform needs to track and manage these costs as part of the subscription model.

1. **Track Model Inference Costs Per PRD Cycle**
   - Add cost-tracking fields to the `payments` or a new `model_usage` table in `shared/schema.ts`:
     - `modelName: text` — "mimo-v2.5" or "kimi-k3"
     - `tokensIn: integer`, `tokensOut: integer`
     - `costUsd: text` (stored as text for precision)
     - `prdCycleId: integer` — foreign key linking the cost to a specific PRD assessment cycle
     - `timestamp: integer` — Unix epoch
   - Instrument `server/lib/llm.ts` (the new routing layer from PRD-019) to emit a cost event to a `model_usage` table after each LLM call.

2. **Subscription Tiers That Include Model Access Quotas**
   - Extend the existing `subscriptionTiers` table (already in `schema.ts`) with model access quota fields:
     - `mimoMonthlyQuota: integer` — max MiMo assessment loops per month (e.g., 100 for Pro, 500 for Enterprise)
     - `kimiIncluded: boolean` — whether self-hosted Kimi-K3 is included (always true, but the field documents the tier)
     - `costBudgetUsd: text` — monthly budget cap for model inference costs
   - The current tiers (from `schema.ts`) should be expanded to include at minimum:
     - **Free**: 10 MiMo loops/month
     - **Pro**: 500 loops/month, Kimi-K3 included
     - **Enterprise**: Unlimited loops, dedicated Kimi-K3 instance, cost reporting dashboard

3. **Cost Alerting When Assessment Costs Exceed Budgeted Amounts**
   - Add a background job (`server/jobs/cost-monitor.ts`) that runs every 6 hours:
     - Query `SUM(costUsd)` from `model_usage` grouped by day, filtered by the current subscription tier.
     - If daily spend exceeds 80% of the tier's `costBudgetUsd`, emit a warning to the security audit log and send a notification (Telegram/Email via the existing gateway in `server/email/queue.ts`).
     - If daily spend exceeds 100% of budget, suspend MiMo assessment requests (route all traffic to Kimi-K3) until the budget resets.

### Priority

**P1** — Cost tracking and alerting prevent runaway API costs from the iterative PRD assessment pipeline. Without it, the $0.01–$0.03/loop cost could scale unpredictably as the assessment pipeline is used more broadly.

### Estimated Effort

- `model_usage` schema and migration: 1–2 days
- Cost-tracking instrumentation in `server/lib/llm.ts`: 2–3 days
- Subscription tier quota fields: 1–2 days
- Background cost monitor job: 2–3 days
- Alerting integration (Telegram/Email gateway): 1–2 days
- **Total: ~7–12 days**

### Mapping to Swarm Findings

| Swarm Finding | PRD-020 Update |
|---|---|
| MiMo-v2.5 cost: $0.01–$0.03/assessment loop | Requirement 1: Track per-loop costs in `model_usage` table |
| Kimi-K3 free when self-hosted | Requirement 2: Subscription tiers differentiate API (MiMo) vs self-hosted (Kimi) access |
| Risk "MiMo-v2.5 cost could scale with many PRD cycles" (FVC_MODEL_ASSESSMENT.md §7, Risk row 5) | Requirement 3: Cost alerting and budget caps mitigate this risk |
| Swarm assessment notes MiMo is 50% cheaper than comparable frontier models | Pricing tiers should reflect this cost advantage in the tier structure |
| Subscription tiers exist in `schema.ts` (subscriptionTiers table) | Update existing `subscriptionTiers` table with model quota fields |
| Payment flow exists (`server/routes.ts` PRD-007 markers at line 1186) | Cost tracking integrates with existing payment/subscription infrastructure |

---

## PRD-021 — Tax Document Generation

### What to Add/Modify

Update PRD-021 to incorporate **Multimodal Document Support** leveraging MiMo-v2.5's omnimodal architecture (text + image + video + audio). The current implementation handles JSON-only 1099 form generation and W-9 text storage. The update enables future document formats beyond JSON, with near-term focus on image capture and audio transcription.

1. **Image-Based W-9/EIN Capture and OCR**
   - Add an endpoint `POST /api/w9/capture-image` that accepts multipart/form-data with an image file (photo of a W-9 or EIN document).
   - Integrate an OCR pipeline (Tesseract.js or a cloud OCR service) to extract tax ID, business name, and payer TIN from the image.
   - The extracted values flow through the existing `isValidTaxId()` validation and `encryptSensitive()` pipeline before storage.
   - Store the original image reference (not the image itself) in a new `w9_document_images` table with columns: `id`, `w9FormId` (FK), `imageUrl`, `ocrConfidence`, `ocrText`, `createdAt`.

2. **Audio Transcription for Client Briefings**
   - Add an endpoint `POST /api/briefings/transcribe` that accepts audio files (MP3, WAV, OGG) and returns a structured text transcription.
   - MiMo-v2.5's native omnimodal capability (text+image+video+audio) makes it the ideal model for transcription + structured extraction — the model can extract key entities (client name, scope, budget, deadlines) from the transcription and output a structured PRD brief JSON.
   - Route transcription tasks through `server/lib/llm.ts` to MiMo-v2.5 (preferred for omnimodal).

3. **Structured Output from Multimodal PRD Parsing**
   - Extend `server/lib/llm.ts` with a `parsePRDBrief multimodal(attachment)` function that:
     - Accepts image/pdf/audio attachments alongside or instead of text.
     - Extracts structured PRD content (requirements, constraints, acceptance criteria) from multimodal inputs.
     - Returns the same structured output format as text-based PRD parsing, enabling the existing assessment pipeline to consume multimodal inputs transparently.
   - Define a multimodal input schema in `shared/schema.ts`:
     - `attachments: text` (JSON array of {type: "image"|"audio"|"pdf", url: string, mimeType: string})
     - `sourceType: "text"|"multimodal"` on the PRD input records.

### Priority

**P2** — Multimodal support is a forward-looking capability. The OCR and transcription features are valuable for improving the W-9 and briefing intake experience, but they are not blockers for current PRD functionality.

### Estimated Effort

- OCR pipeline for W-9 image capture: 5–7 days (including model training/fine-tuning if using local OCR)
- Audio transcription endpoint with MiMo integration: 4–5 days
- Multimodal PRD parsing structured output: 3–4 days
- Schema migration for attachment storage: 1–2 days
- **Total: ~13–18 days**

### Mapping to Swarm Findings

| Swarm Finding | PRD-021 Update |
|---|---|
| MiMo-v2.5 Capability Fit: 8.5/10 — omnimodal architecture (text+image+video+audio) | Requirement 1–3 leverage MiMo's omnimodal capability for new document formats |
| MiMo-v2.5 score row: "Omnimodal (video/audio): ✅ Native" vs Kimi-K3 "Text+image only" | MiMo is the designated model for multimodal tasks; Kimi-K3 is not suitable for audio/video processing |
| Current `tax-documents.ts` (PRD-021) is JSON-only | Extension adds image, audio, and multimodal input channels |
| `server/lib/llm.ts` created by PRD-019 update | PRD-021 builds on PRD-019's routing layer for model selection |
| FVC_MODEL_ASSESSMENT.md §2: MiMo's omnimodal advantage irrelevant to Security Sentinel gap | This update targets MiMo's *strength* (omnimodal) rather than the gap it cannot fill |

---

## PRD-022 — GDPR/CCPA Data Privacy

### What to Add/Modify

Update PRD-022 to incorporate **Data Pipeline Engineer** requirements. The swarm audit (Gap Analysis §5) identified that no ETL layer or data freshness monitoring exists. The FVC platform handles personal data (user profiles, W-9 tax IDs, payment info) and needs automated data flow governance.

1. **Automated Data Flow Mapping (Collection → Storage → Export → Deletion)**
   - Create a data flow registry (`server/lib/data-flow.ts`) that programmatically documents every data pathway in the FVC application:
     - **Collection**: Each endpoint that collects PII (W-9 submission, profile creation, consent cookie) records what data it collects and where.
     - **Storage**: Where each data type is stored (SQLite tables, encrypted vs plaintext) and the encryption status.
     - **Export**: Every export endpoint (tax-export, GDPR data export) documents what it exports and in what format.
     - **Deletion**: Every deletion/anonymization endpoint (GDPR data deletion, account revocation) documents what is deleted and what is retained (IRS 7-year retention).
   - The data flow registry should be auto-generated from code annotations (`// DATA_FLOW: collects -> storage -> export -> deletion`) plus runtime introspection, so it stays current as the codebase evolves.
   - Expose a `GET /api/admin/data-flow-map` endpoint (admin-only) that returns the current data flow as JSON for audit purposes.

2. **Data Freshness SLAs and Quality Monitoring**
   - Add a `data_freshness` table in `shared/schema.ts`:
     - `entity: text` — table or data entity name
     - `lastUpdated: integer` — Unix epoch of last write
     - `freshnessSLAms: integer` — maximum acceptable staleness in milliseconds (e.g., 24 hours for user profiles, 1 hour for payment records)
     - `lastCheck: integer` — Unix epoch of last freshness check
   - Implement a background job (`server/jobs/freshness-monitor.ts`) that runs every 30 minutes:
     - Checks each entity's `lastUpdated` against its SLA.
     - If any entity exceeds its SLA, logs a freshness violation to `security_audit_log` with details (entity, staleness in hours, SLA threshold).
     - If >5% of entities are stale, emit a critical alert via the existing Telegram/Email gateway.

3. **Structured Data Operations for Audit Trail Integrity**
   - Enhance the existing `security_audit_log` table (already in `schema.ts`) with structured operation metadata:
     - `operationType: text` — "CREATE", "READ", "UPDATE", "DELETE", "EXPORT", "IMPORT"
     - `tableName: text` — the table affected
     - `recordId: integer` — the affected record's primary key
     - `beforeState: text` (JSON) — snapshot of the record before the operation (redacted for PII)
     - `afterState: text` (JSON) — snapshot after the operation
     - `operationHash: text` — SHA-256 hash of the operation record for integrity verification
   - Implement a periodic integrity check (`server/jobs/audit-integrity.ts`) that:
     - Recomputes `operationHash` for each audit log entry.
     - Flags any record where the hash doesn't match (tampering detection).
     - Stores integrity results in a `audit_integrity_checks` table.
   - This directly supports GDPR Article 30 (records of processing activities) and CCPA audit requirements.

### Priority

**P0** — Data flow governance and audit trail integrity are foundational for GDPR/CCPA compliance. Without automated mapping and freshness monitoring, the platform cannot prove it handles personal data correctly, which is a legal requirement for operating in the EU and California.

### Estimated Effort

- Data flow registry (`server/lib/data-flow.ts`): 4–5 days
- Data flow mapping annotations across existing endpoints: 3–4 days
- Freshness monitoring schema + background job: 2–3 days
- Structured audit log enhancements + integrity checks: 3–4 days
- Admin data flow map endpoint + integrity dashboard: 2–3 days
- **Total: ~14–19 days**

### Mapping to Swarm Findings

| Swarm Finding | PRD-022 Update |
|---|---|
| Gap Analysis §5: Data Pipeline Engineer gap — no ETL or data freshness monitoring | Requirements 1–2 directly fill this gap |
| Neither MiMo-v2.5 nor Kimi-K3 fills the structural Data Pipeline gap | This PRD specifies dedicated tooling, not model assistance |
| GDPR/CCPA compliance is already partially implemented (PRD-022) | Update extends the existing foundation with structured automation |
| FVC_MODEL_ASSESSMENT.md §5: Security Sentinel gap also noted — audit trail integrity supports the Security Sentinel goal | Requirements 2+ overlap with PRD-018's compliance gap automation, creating a defense-in-depth approach |
| Existing `security_audit_log` table in `schema.ts` already tracks access | Requirement 3 structures and enhances this existing capability rather than replacing it |
| `routes.ts` PRD-022 markers at lines 1209, 1239, 1380, 1385, 1428 — GDPR export/deletion endpoints | Data flow registry maps these endpoints into the collection→storage→export→deletion chain |

---

## PRD-023 — Infrastructure Health Monitoring (NEW)

### What to Add/Modify

This is a **new PRD** created to fill the Infrastructure Health Watchdog gap identified in the swarm audit (Gap Analysis §5, row 3). Neither MiMo-v2.5 nor Kimi-K3 fills this structural gap — it requires dedicated tooling.

### Requirements

1. **Proactive Service Health Monitoring**
   - Implement a health check module (`server/lib/health.ts`) that monitors:
     - Database connectivity (SQLite connection health, query latency).
     - Stripe API connectivity (test webhook signing secret validation, API ping).
     - OpenRouter API availability (MiMo-v2.5 availability check with latency tracking).
     - Self-hosted Kimi-K3 availability (if configured) — health ping endpoint.
     - File system health (disk space for SQLite, uploads directory, temp files).
   - Each service gets a status: `healthy`, `degraded`, `unhealthy`.
   - Expose `GET /api/health` (public) and `GET /api/admin/health/detailed` (admin-only with full diagnostics).

2. **Anomaly Detection for API Response Times and Error Rates**
   - Implement rolling-window metrics in `server/lib/health.ts`:
     - Track response time percentiles (p50, p95, p99) per route over 5-minute windows.
     - Track error rates (5xx responses) per route over 5-minute windows.
     - Store metrics in an in-memory ring buffer (not SQLite — metrics are ephemeral by nature; persist only anomalies).
   - Define anomaly thresholds (configurable, defaults shown below):
     - **Response time**: p95 > 2s for any route = `degraded`; p95 > 5s = `unhealthy`.
     - **Error rate**: >5% 5xx rate for any route over 5 minutes = `degraded`; >20% = `unhealthy`.
     - **Stripe API**: >10% failure rate = `degraded`; >30% = `unhealthy`.
     - **LLM routing**: >2 consecutive failovers = `degraded`; >5 consecutive = `unhealthy`.
   - Anomalies are logged to `security_audit_log` with `operationType: "SYSTEM_ALERT"`.

3. **Cascading Failure Prevention**
   - Implement circuit breakers for all external dependencies (Stripe, OpenRouter, Kimi-K3):
     - **Closed** (normal): Requests flow normally, failures are counted.
     - **Open** (threshold exceeded): After 5 consecutive failures within a 60-second window, the circuit opens for 30 seconds. Requests are immediately rejected with a `503 Service Unavailable` and a `Retry-After` header.
     - **Half-Open**: After the timeout, the next request is allowed through. If it succeeds, the circuit closes. If it fails, it reopens.
   - Implement graceful degradation:
     - If the LLM routing layer is unhealthy, PRD assessment requests return a structured response indicating the service is degraded (not a crash).
     - If Stripe is unhealthy, subscription management endpoints return a friendly "Service temporarily unavailable" message rather than a 500 error.
     - If the database is unhealthy, return cached responses where possible (e.g., cached subscription tiers, cached PRD metadata).

4. **Automated Alerting via Existing Telegram/Email Gateway**
   - Integrate with the existing notification infrastructure (`server/email/queue.ts` for email, Telegram bot for messaging):
     - **Warning** (`degraded`): Log to audit trail and emit a non-urgent notification to the `#fvc-alerts` Telegram channel (or equivalent).
     - **Critical** (`unhealthy`): Immediate Telegram notification + email to `ADMIN_EMAIL` (from environment). Include the affected service, current metrics, and time of first failure.
     - **Recovery** (service returns to `healthy`): Send a recovery notification to the same channel/email.
   - Alert rate limiting: No more than 1 alert per service per 15 minutes to avoid alert fatigue.

### Priority

**P0** — Infrastructure monitoring is a structural gap that affects every other PRD's reliability. Without it, the platform cannot detect degradation before users are affected. Anomaly detection and circuit breakers prevent cascading failures that could take down the entire PRD assessment pipeline.

### Estimated Effort

- Health check module (`server/lib/health.ts`): 3–4 days
- Anomaly detection with rolling window metrics: 4–5 days
- Circuit breaker implementation for all external dependencies: 3–4 days
- Graceful degradation logic per service: 2–3 days
- Telegram/Email alerting integration with rate limiting: 2–3 days
- Admin health dashboard endpoint (`GET /api/admin/health/detailed`): 2–3 days
- **Total: ~16–22 days**

### Mapping to Swarm Findings

| Swarm Finding | PRD-023 Update |
|---|---|
| Gap Analysis §5: Infrastructure Health Watchdog gap — no proactive monitoring | This entire PRD fills the gap |
| Neither MiMo-v2.5 nor Kimi-K3 fills the Infrastructure Health gap | PRD-023 specifies dedicated tooling, not model assistance |
| MiMo-v2.5 Risk "OpenRouter dependency for API access" (FVC_MODEL_ASSESSMENT.md §7, Risk row 2) | Circuit breaker + failover to Kimi-K3 (from PRD-019) mitigates this |
| MiMo-v2.5 Risk "MiMo-v2.5 cost could scale" (FVC_MODEL_ASSESSMENT.md §7, Risk row 5) | Cost monitoring is in PRD-020; this PRD monitors system health, not costs |
| Self-hosted Kimi-K3 requires GPU infrastructure (FVC_MODEL_ASSESSMENT.md §7, Risk row 6) | Health module monitors Kimi-K3 availability and alerts if the instance goes down |
| Sprint 5 review found no monitoring/alerting infrastructure | PRD-023 introduces proactive monitoring + alerting via existing Telegram/Email gateway |
| Circuit breaker pattern aligns with existing error handling in `server/lib/llm.ts` (PRD-019) | PRD-023 and PRD-019 are co-dependent — the routing layer and the health monitor share circuit breaker state |

---

## Cross-PRD Dependencies

| From PRD | To PRD | Dependency |
|---|---|---|
| PRD-019 (`server/lib/llm.ts`) | PRD-018 (Security Sentinel) | The routing layer emits model selection decisions that the Security Sentinel compliance tool can audit |
| PRD-019 (`server/lib/llm.ts`) | PRD-020 (Model cost tracking) | Cost events from each LLM call flow into the `model_usage` table |
| PRD-019 (`server/lib/llm.ts`) | PRD-021 (Multimodal) | Multimodal inputs are routed through the same `server/lib/llm.ts` layer |
| PRD-019 (circuit breaker) | PRD-023 (Infrastructure monitoring) | Circuit breaker state is exposed via the health check module |
| PRD-020 (cost tracking) | PRD-023 (Alerts) | Cost budget alerts flow through the same notification channel as infrastructure alerts |
| PRD-022 (data flow mapping) | PRD-018 (Compliance gap tool) | The compliance-as-code module reads the data flow registry to validate that all PII pathways have encryption and audit coverage |
| PRD-022 (audit log integrity) | PRD-018 (Audit trail) | PRD-022 enhances the existing audit log with structured operations and hash-based integrity |
| PRD-023 (health monitoring) | PRD-019 (failover) | Health monitoring triggers the failover mechanism when OpenRouter is degraded |

---

## Effort Summary

| PRD | Priority | Est. Effort | Swarm Gap Addressed |
|---|---|---|---|
| PRD-018 (Security Sentinel) | P0 | 10–14 days | Security Sentinel gap (#1) |
| PRD-019 (Multi-model routing) | P1 | 10–14 days | Integration gap (OpenRouter + Kimi-K3) |
| PRD-020 (Assessment cost tracking) | P1 | 7–12 days | Cost risk from iterative PRD assessment loops |
| PRD-021 (Multimodal docs) | P2 | 13–18 days | MiMo omnimodal capability utilization |
| PRD-022 (Data Pipeline Engineer) | P0 | 14–19 days | Data Pipeline Engineer gap (#2) |
| PRD-023 (Infrastructure Health) | P0 | 16–22 days | Infrastructure Health Watchdog gap (#3) |
| **Total** | — | **70–99 days** | **3 structural gaps + 3 existing PRDs updated** |

---

## End of Document

*This document was produced by Nexus (FVC Swarm Pipeline) based on the consolidated swarm assessment and Sprint 5 review findings. No code files were modified — this is a design specification document only.*

*Source documents: `FVC_MODEL_ASSESSMENT.md`, `REVIEW_REPORT_SPRINT5_PRD018_022.md`*
