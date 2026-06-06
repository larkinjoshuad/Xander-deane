# Production Readiness Roadmap

This roadmap turns the current contract-first prototype into a production-ready education product. It is intentionally sequenced to avoid live child-facing AI orchestration before learner state, safety, verification, and persistence are reliable while still allowing synthetic tutor-quality validation.

## Current Status

The project is in the **prototype foundation** stage. It has a runnable web shell, subject-agnostic contracts, deterministic evaluators, example subject packs, session records, and prototype persistence plus Fetch/Node HTTP service boundaries. It is not yet ready for real learners because privacy/legal data governance, authentication, production consent, retention/deletion/export operations, voucher/ESA compliance review, safety operations, durable storage, browser-level verification, observability, deployment, and AI orchestration are not complete.

## Risk-First Sequencing Principle

This is child-facing education software, so the roadmap must optimize first for irreversible risk reduction, not demoability. Browser automation and server-backed persistence are still important, but they must remain synthetic-data engineering gates until privacy, consent, safety, and payment-compliance controls are explicit.

1. **No real minor PII or learner records** should be collected until account ownership, guardian/school authority, consent scope, data classification, retention, export, deletion, and audit paths are implemented and reviewed.
2. **Persistence work must prove governance controls**, not just database durability: every create/read/list/append/delete/export path needs authorization, consent, versioning, retention, and audit coverage before real data.
3. **Voucher/ESA flows must remain sandbox-only** until provider registration, program-specific eligibility, documentation, refund/reimbursement, and audit-export requirements are reviewed.
4. **Live child-facing AI remains blocked** until the above controls plus model-gateway validation, safety policy enforcement, and deterministic fallback behavior are in place; synthetic-only model-gateway evaluation is allowed to de-risk tutor quality without learner data.

## Completed Foundation

| Area | Completed | Evidence in repo |
| --- | --- | --- |
| Contract source of truth | JSON Schemas exist for objectives, problems, events, tutor responses, learner profiles, workspace snapshots, tutor policies, evaluation results, session records, and HTTP API exchanges, with `schemas/index.json` registering schema IDs and fixture suffixes. | `schemas/` |
| Cross-subject examples | Math, language, science, and shared learner fixtures exist and validate. | `examples/` |
| Deterministic runtime | Domain helpers, subject packs, workspace descriptors, and evaluators exist without runtime dependencies. | `src/core/` |
| Learning session loop | Math equal-groups, language token-selection, and science classification-sort flows create snapshots, events, tutor responses, and evaluations. | `src/app/learning-session.js` |
| Web shell prototype | Static browser shell renders tutor panel, workspace host, subject renderers, controls, and event log. | `app/` |
| Prototype persistence | Session records can be created, rehydrated, saved locally, moved through in-memory/file service boundaries, wrapped with prototype identity/consent/audit access checks, backed by in-memory or file audit stores, stored through overwrite-file, append-only JSONL, or SQLite session adapters, reconciled with SQLite audit-event storage in tests, exposed through Fetch-style and Node HTTP adapters with optimistic record versions and delete preconditions, and checked with synthetic recovery-drill reports for active records plus deleted-session tombstones. | `src/app/session-persistence.js`, `src/app/session-service.js`, `src/app/session-access-service.js`, `src/app/session-http-api.js`, `src/app/recovery-drill.js` |
| Consent, safety, and identity contracts | Consent records, safety policies, safety incidents, data-retention policies, identity accounts, learner-account links, and audit events exist with fixtures, runtime helpers, tutor-context summaries, consent-aware session persistence guardrails, and a synthetic safety-operations incident queue. | `schemas/consent-record.schema.json`, `schemas/account.schema.json`, `schemas/audit-event.schema.json`, `src/app/identity-access.js`, `src/app/audit-log.js` |
| Learner-data inventory | Every registered schema has a machine-readable data classification that keeps learner, AI, safety, voucher, billing, and audit records synthetic/review-gated in prototype mode. | `schemas/data-inventory.schema.json`, `examples/governance/base.data-inventory.json`, `scripts/validate-data-inventory.js` |
| Voucher/ESA sandbox operations | Voucher funding sources, redemptions, checkout, invoices, ledgers, and sandbox-only compliance packets exist so program readiness can be reviewed before real funds are accepted. | `src/app/voucher-acceptance.js`, `src/app/voucher-checkout.js`, `src/app/voucher-billing.js`, `src/app/voucher-operations.js` |
| Synthetic model-gateway spike | A synthetic-only model gateway can validate tutor-response shape, safety policy behavior, and rubric scorecards without real learner data or provider calls. | `src/app/model-gateway.js`, `src/app/tutor-quality-evaluation.js`, `schemas/tutor-quality-scorecard.schema.json`, `docs/ai-tutor-evaluation.md`, `test/model-gateway.test.js`, `test/tutor-quality-evaluation.test.js` |
| Validation and unit tests | Schema-registry-backed fixture validation and Node unit tests cover core contracts, API exchange fixtures, runtime, session flow, persistence, service stores, and renderer routing. | `scripts/validate-fixtures.js`, `test/` |

## Still To Do Before Production

| Priority | Workstream | Required outcome | Why it matters |
| --- | --- | --- | --- |
| P0-R1 | Identity, privacy, and consent | Provider auth adapters, learner ownership, educator/guardian authority, consent ownership checks, data classification, data minimization, retention, deletion, export, and production consent flows. | Required before any real learner data or minor PII is stored. |
| P0-R2 | Safety policy enforcement | Age-aware policy, blocked behavior handling, escalation/handoff, incident response, audit logging, and moderation hooks. | Required for education and child-safety readiness before AI or real learner use. |
| P0-R3 | Voucher/ESA compliance and billing | Provider registration tracking, eligible product catalog, checkout funding selection, invoice/ledger reconciliation, documentation workflow, refunds, audit exports, and program-specific rule review. | Required before accepting homeschool voucher or ESA funds without payment/compliance risk. |
| P0-R4 | Governed production persistence | Concrete database-backed session/audit service using access-controlled HTTP adapters with append-only events/snapshots, durable audit events, consent checks, retention export, deletion, backup/restore drills, and recovery APIs. | Required for cross-device recovery and future AI context, but only after governance controls are enforced on every data path. |
| P0-R5 | Browser-level product verification | Playwright browser automation now covers math, language, science, recovery, viewport/device hooks, and keyboard reachability; CI/browser-binary availability, passing automated accessibility smoke checks, and deeper manual accessibility review remain release gates. | Confirms the learner-facing experience works, but should not gate collecting real data ahead of privacy/safety/compliance controls. |
| P1 | Tutor context contract | Formal `TutorContext` schema now combines learner profile, objective, problem, recent events, snapshot, evaluation, tutor policy, skill mastery, and progress summary; synthetic model-gateway enforcement exists, and provider-backed enforcement still needs implementation. | Needed before adding AI calls safely. |
| P1 | AI orchestration | Provider-backed model gateway, prompt templates, policy checks, deterministic fallback behavior, response validation, and quality-scorecard review; synthetic-only gateway validation may run earlier with fixtures. | Converts scripted feedback into AI tutoring without losing auditability while keeping real child-facing AI blocked. |
| P1 | Accessibility and device UX hardening | WCAG review, keyboard/screen-reader support, computer/tablet/phone/smart-glasses layouts, error states, loading states, and classroom usability. | Required for inclusive real-world use across learner devices. |
| P1 | Observability and quality gates | Structured logs, metrics, tracing, error reporting, dashboards, and CI quality gates. | Required to operate and debug at scale. |
| P2 | Curriculum scale-out | More grade bands, locales, subject packs, skill mastery/progress summary reporting, content authoring tools, and review workflows. | Required to become a broad education product. |
| P2 | Deployment and operations | Hosted environments, migration strategy, backups, incident response, and cost controls. | Required to serve pilots and scale responsibly. |

## Production Timeline Estimate

The estimate assumes a small focused product team and no major regulatory blockers. Calendar time can compress with more engineers, but several gates should not be skipped because they protect learner safety and data integrity.

| Phase | Target window | Exit criteria | Release confidence |
| --- | --- | --- | --- |
| 1. Risk and data-governance foundation | Weeks 1-2 | Regulatory assumptions, build-vs-buy posture, data inventory, minor-PII classification, guardian/school authority model, consent scopes, retention/export/delete requirements, voucher/ESA sandbox constraints, safety escalation requirements, and synthetic tutor-quality evaluation are documented and testable. | Project can continue with synthetic data without drifting toward unsafe real-learner collection while the AI moat is evaluated early. |
| 2. Governed session service | Weeks 3-6 | Concrete database-backed `SessionRecord` service supports authenticated create/read/list/append/delete/export flows with consent checks, durable version checks, retention semantics, and audit tests. | Internal alpha can preserve synthetic learner state and prove controls before real data. |
| 3. Identity, privacy, safety, and voucher compliance baseline | Weeks 7-10 | Auth roles, learner ownership, append-only audit events, production consent/retention rules, safety policy enforcement, voucher invoice/ledger reconciliation, documentation, and refund controls are implemented and reviewed. | Closed staff/partner alpha can use synthetic or counsel-approved pilot data and approved voucher test workflows. |
| 4. Tutor context and controlled AI | Weeks 11-14 | `TutorContext` contract, model gateway, response validation, moderation hooks, and deterministic fallbacks are implemented. | AI tutoring can be tested in limited supervised pilots. |
| 5. Accessibility, curriculum, and educator pilot | Weeks 15-20 | WCAG review, device QA across computer/tablet/phone/smart-glasses presets, classroom UX fixes, educator dashboard basics, expanded content packs, and pilot analytics are ready. | Limited school/home beta can begin. |
| 6. Production hardening and launch readiness | Weeks 21-28 | Observability, load tests, backups, incident playbooks, security review, cost controls, and compliance review are complete. | Production launch candidate. |

## Practical Release Gates

| Gate | Must be true before proceeding |
| --- | --- |
| Internal alpha | Data inventory and consent/retention/export/delete paths are defined; browser tests pass; session service stores/replays synthetic records; no real learner PII is collected. |
| Closed beta | Auth, consent, retention, deletion/export, safety logging, accessibility review, voucher/payment compliance review, and supervised AI flows are complete. |
| Public production | Security review, incident response, observability, load testing, backups, compliance review, and support workflows are complete. |

## Recommended Immediate Sprint

The next sprint should be **risk-first**, with browser and persistence work constrained to synthetic data until governance is proven. It should cover:

1. explicit mode boundaries, regulatory assumptions, and validated learner-data inventory so portfolio architecture work cannot be mistaken for real-learner readiness;
2. build-vs-buy decisions that label current auth, consent, audit, persistence, and voucher modules as reference implementations unless production provider adapters are selected;
3. a learner/minor-PII data inventory that labels every schema field, fixture type, session record, audit event, voucher record, and future tutor-context field as prohibited, restricted, or safe for pilot use;
4. consent, authority, retention, export, and deletion acceptance tests that exercise every session API create/read/list/append/delete/export path;
5. synthetic-only model-gateway evaluation that tests tutor quality, scorecard thresholds, and response validation without real learner data;
6. expand safety operations for blocked tutor output, human escalation, incident creation, audit logging, and deterministic fallback into provider-backed review workflows;
7. turn voucher/ESA sandbox compliance packets into operator review and administrator-export workflows before any real payment flow;
8. browser automation and screenshot artifacts as verification support, not permission to store real learner data;
9. server-backed persistence and recovery drills only with synthetic fixtures until the above gates pass.

Provider-backed or live child-facing AI orchestration should remain blocked until this sprint produces enforceable policy gates and audit evidence.
