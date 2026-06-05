# Strategic Implementation Plan

This plan converts the recent product recommendations into an implementation sequence. The analysis below intentionally narrows the scope so the project does not try to become an AI tutor, curriculum platform, voucher operations system, device lab, and analytics product all in the same release.

## Plan Evaluation and Adjustment

### Original recommendation set

1. Content and curriculum authoring.
2. Learner progress and mastery model.
3. Parent/educator dashboard.
4. Trust, safety, privacy, and consent workflows.
5. AI governance and `TutorContext` before model calls.
6. Product analytics/event taxonomy.
7. Offline-first and low-bandwidth support.
8. Input-mode QA beyond viewport/device size.
9. Voucher/ESA operations console.
10. Pilot strategy and human support workflows.

### Adjustment

The highest-leverage next implementation is the **learner progress model** because it unlocks several later features without increasing AI or compliance risk:

- parent/educator dashboards need progress summaries,
- adaptive learning paths need mastery estimates,
- AI tutor context should include progress state,
- curriculum authoring needs objective-level outcomes,
- pilot success metrics need measurable learning signals.

Therefore the plan starts with a portable `SkillMastery` contract and dependency-free reference runtime before adding dashboards, AI calls, or durable production services.

## Implementation Sequence

| Phase | Build | Exit criteria |
| --- | --- | --- |
| 1 | `SkillMastery` contract and runtime | Objective-level attempt counts, correctness, mastery estimate, confidence, evidence, and next-objective recommendations can be created and validated. |
| 2 | Parent/educator progress summary | Dashboard-facing summaries aggregate mastery records by learner, subject, and objective. |
| 3 | `TutorContext` contract | AI/scripting receives learner profile, device profile, objective, problem, snapshot, evaluation, policy, and mastery state in one validated context. |
| 4 | Safety/consent contracts | Guardian consent, data retention, safety incident, and escalation records become explicit contracts. |
| 5 | Content authoring workflow | Objectives/problems gain draft/review/publish state and reviewer metadata. |
| 6 | Pilot operations | Pilot cohort, support ticket, analytics-safe event taxonomy, and device QA gates are wired into release readiness. |

## Current Implementation Slice

This slice now implements Phases 1, 2, 3, the first contract/runtime portion of Phase 4, and the first identity/access scaffold needed for pilot operations:

- `schemas/skill-mastery.schema.json`
- `schemas/progress-summary.schema.json`
- `schemas/tutor-context.schema.json`
- `schemas/consent-record.schema.json`
- `schemas/safety-policy.schema.json`
- `schemas/safety-incident.schema.json`
- `schemas/data-retention-policy.schema.json`
- `schemas/account.schema.json`
- `schemas/learner-account-link.schema.json`
- `src/app/progress-model.js`
- `src/app/tutor-context.js`
- `src/app/consent-safety.js`
- `src/app/identity-access.js`
- consent-aware `src/app/session-service.js` persistence guardrails
- `examples/math/mastery.skill-mastery.json`
- `examples/math/progress.progress-summary.json`
- `examples/math/context.tutor-context.json`
- `examples/safety/guardian-consent.consent-record.json`
- `examples/safety/minor.safety-policy.json`
- `examples/safety/blocked-response.safety-incident.json`
- `examples/safety/session.data-retention-policy.json`
- `examples/identity/guardian.account.json`
- `examples/identity/guardian-link.learner-account-link.json`
- `test/progress-model.test.js`
- `test/tutor-context.test.js`
- `test/consent-safety.test.js`
- `test/identity-access.test.js`

The slice remains synthetic-data-only for AI evaluation. It can be used by parent/educator dashboards, adaptive sequencing, scripted tutor responses, synthetic model-gateway construction, and pre-pilot consent/safety enforcement. Tutor contexts now include consent/safety summaries, and session persistence can require active consent scopes before records are saved.

## Updated Near-Term Backlog

1. Keep the mode boundary explicit with `docs/regulatory-assumptions.md`: synthetic architecture work is allowed, but real minor PII, real school records, real funds, and live child-facing AI remain blocked.
2. Use `docs/build-vs-buy-strategy.md` to separate reference implementations from production provider adapters.
3. Use `docs/product-validation-plan.md` and `docs/ai-tutor-evaluation.md` to validate tutor quality and product demand before expanding production infrastructure.
4. Complete a risk-first learner-data inventory covering schemas, fixtures, session records, tutor context, audit events, and voucher records before collecting any real learner data.
5. Convert consent, guardian/school authority, retention, export, deletion, and audit behavior into acceptance tests on every session API data path.
6. Add safety operations for blocked tutor output, human escalation, incident creation, and deterministic fallback.
7. Keep voucher/ESA flows sandbox-only until provider eligibility, documentation, refund/reimbursement, and audit-export requirements are reviewed.
8. Connect identity/access checks to future API/session endpoints and audit logs with production auth adapters replacing fixture auth.
9. Add content authoring status/version fields before scaling subject packs.
10. Add provider-backed model-gateway adapters only after synthetic tutor responses are validated against consent, safety, retention, and audit policy.
