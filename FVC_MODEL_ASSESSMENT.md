# FVC Model Assessment — Swarm Delegated Review

**Date:** 2026-07-30 12:33 ET
**Scope:** MiMo-v2.5 (Xiaomi) vs Kimi-K3 (Moonshot AI) for the FVC PRD build pipeline
**Swarm Framework:** agent-swarm-governance + 3-agency gap framework (Security Sentinel, Data Pipeline, Infrastructure Watchdog)
**Context:** /opt/data/thefvc-app-source
**Poolside Model:** ling-3.0-flash:free (produced REVIEW_REPORT_SPRINT5_PRD018_022.md, commit 67270f1)

---

## 1. Repo & PRD Inventory

| PRD | Description | Status |
|-----|-------------|--------|
| PRD-006 | Crew Finder Pagination | Implemented |
| PRD-007 | Payments & Monetization | Implemented |
| PRD-008 | Testing & CI | Implemented |
| PRD-018 | Security & Compliance Hardening | Implemented |
| PRD-019 | Stripe Connect Production Integration | Implemented |
| PRD-020 | Subscription Management | Implemented |
| PRD-021 | Tax Document Generation (1099) | Implemented |
| PRD-022 | GDPR/CCPA Data Privacy | Implemented |

**P0 bugs fixed** (commit 7ba16e5): password reset field mismatch, email template args, tax ID encryption leakage, SQL LIKE injection, Stripe idempotency.

---

## 2. MiMo-v2.5 Assessment (Agent Alpha → /opt/data/thefvc-app-source/MIMOV25_ASSESSMENT.md)

**Fit Score: 8.2/10**

| Dimension | Score | Key Finding |
|-----------|-------|-------------|
| Capability Fit | 8.5 | Omnimodal architecture; agentic benchmarks (SWE-bench Pro 57.2%, ClawEval 63.8, GDPVal 72.9) directly map to PRD→code pipeline |
| Context Window | 10.0 | 1M tokens — comfortably holds full FVC codebase + all PRDs in one pass |
| Cost Efficiency | 9.5 | $0.01–$0.03 per full assessment loop; 50% cheaper than comparable frontier models |
| Agentic Capability | 9.0 | Long-horizon orchestration proven; multi-step PRD review → fix → validate loop well within capability |
| Security Sentinel | 6.5 | Complementary layer only — cannot replace SAST/DAST tools (semgrep, npm audit) |
| Integration | 7.5 | OpenRouter API is OpenAI-compatible; greenfield for LLM abstraction layer |

**Key recommendation:** Use MiMo-v2.5 (not Pro) for PRD assessment loops; reserve Pro for complex code generation. Pilot on PRD-022 first.

---

## 3. Kimi-K3 Assessment (Agent Beta → pending file write)

**Expected Fit Score: 7.5–8.5/10** (preliminary — awaiting full agent output)

| Dimension | Preliminary Finding |
|-----------|---------------------|
| Capability Fit | 2.8T params, native vision agentic model; aligned with FVC text/code PRDs |
| Context Window | 1M tokens native — largest out-of-the-box context in the comparison |
| Cost Efficiency | Open-weight (Modified MIT) — self-hosted cost only; no per-token API fees |
| Agentic Capability | Strong long-context reasoning; excellent for parsing full PRD bundles |
| Security Sentinel | Similar to MiMo — logic-level review only; needs dedicated SAST tools |
| Integration | Requires self-hosting infrastructure (not API-ready like MiMo via OpenRouter) |
| Licensing | Modified MIT — fully open; no API key dependency; can fine-tune |

---

## 4. Head-to-Head Comparison

| Factor | MiMo-v2.5 | Kimi-K3 | Winner |
|--------|-----------|---------|--------|
| API availability | ✅ OpenRouter, instant integration | ❌ Self-host only (open weights) | **MiMo** |
| Context window | 1M (progressive fine-tuning) | 1M (native) | **Kimi** (no warm-up needed) |
| Cost (API) | $0.112/1M in, $0.224/1M out | N/A (self-host infra cost) | **MiMo** (predictable API cost) |
| Cost (self-host) | Not feasible (proprietary) | ✅ Free model + infra only | **Kimi** |
| Agentic benchmarks | SWE-bench Pro 57.2%, GDPVal 72.9 | Competitive (K3 benchmarks pending) | **MiMo** (more data) |
| Licensing | Proprietary | Modified MIT | **Kimi** |
| Security Sentinel fit | Complementary only | Complementary only | **Tie** |
| Integration effort | Low (OpenRouter drop-in) | High (self-host + infra) | **MiMo** |
| Production track record | New (April 2026) | Newer (K3 dropped 2026) | **MiMo** (slightly more mature) |
| Omnimodal (video/audio) | ✅ Native | ❌ Text+image only | **MiMo** |

---

## 5. Swarm Coverage Gap Analysis

Per the agent-swarm-governance skill (3-agency gap framework):

| Gap | Current State | MiMo Impact | Kimi Impact |
|-----|---------------|-------------|-------------|
| **Security Sentinel** | No vulnerability scanning agent | MiMo can serve as complementary logic-level reviewer; needs semgrep/npm audit as primary | Same — MiMo's omnimodal advantage irrelevant here |
| **Data Pipeline Engineer** | No ETL, data freshness monitoring | MiMo can assess PRD data flows but not build ETL | Same |
| **Infrastructure Health Watchdog** | No proactive monitoring | Neither model fills this — needs dedicated tooling | Same |

**Neither model fills the 3 structural swarm gaps.** The swarm still needs dedicated agents for Security Sentinel, Data Pipeline Engineering, and Infrastructure Health Monitoring — models assist but don't replace these roles.

---

## 6. Recommendation

### Primary: MiMo-v2.5 (via OpenRouter)
**Rationale:**
- Lowest friction: OpenRouter API drop-in, no self-hosting infrastructure needed
- Cost-effective for iterative PRD assessment loops ($0.01–$0.03 per cycle)
- 1M token context handles full FVC codebase + all PRDs in a single pass
- Strong agentic benchmarks directly map to the PRD→code pipeline
- 7-provider redundancy on OpenRouter reduces single-point-of-failure risk

### Secondary: Kimi-K3 as failover / self-hosted option
**Rationale:**
- If OpenRouter becomes unavailable, Kimi-K3 provides an open-weight fallback
- Self-hosted, no vendor lock-in
- Modified MIT license means full control over data (critical for GDPR/CCPA compliance — no third-party API calls with sensitive FVC data)
- 1M native context without progressive fine-tuning warm-up

### Integration Order

1. **Immediate:** Wire MiMo-v2.5 via OpenRouter as the primary model. Create `server/lib/llm.ts` abstraction layer.
2. **Week 1:** Pilot MiMo on PRD-022 (GDPR/CCPA — lowest risk PRD). Validate reliability.
3. **Week 2:** Expand MiMo to all active PRDs (006, 007, 018–022). Run full PRD assessment → fix → validate loop.
4. **Week 3:** Set up Kimi-K3 self-hosted instance as failover. Wire into the same `server/lib/llm.ts` abstraction with a provider switch.
5. **Week 4:** Full multi-model pipeline — MiMo for routine assessment, Kimi for deep-dive long-context analysis and self-hosted compliance tasks.

---

## 7. Key Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| MiMo-v2.5 production track record is limited | Medium | Pilot PRD-022 first; monitor all outputs |
| OpenRouter dependency for API access | Medium | Kimi-K3 self-hosted failover in Week 3 |
| Neither model replaces SAST/DAST tooling | High | Complement with semgrep, npm audit, Snyk |
| Self-hosting Kimi-K3 requires GPU infrastructure | Medium | Plan infra budget before Week 3 |
| MiMo-v2.5 cost could scale with many PRD cycles | Low | Prompt caching reduces cost 60–80%; budget cap at $10/month |

---

## 8. Deliverables

| File | Description |
|------|-------------|
| `MIMOV25_ASSESSMENT.md` | Agent Alpha — MiMo-v2.5 detailed assessment (committed by Agent Alpha) |
| `KIMIK3_ASSESSMENT.md` | Agent Beta — Kimi-K3 detailed assessment (awaiting completion) |
| `FVC_MODEL_ASSESSMENT.md` | This consolidated swarm assessment document |

---

*Consolidated by Hermes Agent for the FVC swarm assessment.*
*Swarm framework: agent-swarm-governance (3-agency gap model)*
*PRD source: /opt/data/thefvc-app-source/REVIEW_REPORT_SPRINT5_PRD018_022.md*
