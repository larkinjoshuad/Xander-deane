# Xander-deane

Xander-deane is the foundation for a subject-agnostic, multimodal AI education platform. The goal is to support math, language, science, and other educational domains through a reusable base layer that can power web, mobile, classroom, and assistive learning experiences.

## Current Base Layer

This repository now contains the first implementation slice for the platform foundation:

- Portable JSON Schema contracts for cross-language implementations, indexed by a schema registry.
- A dependency-free JavaScript reference implementation for early UI/API prototypes.
- Architecture documentation for scaling the learning runtime to global usage.
- A technical evaluation and corrective plan for production readiness gaps.
- Cross-subject example fixtures for math, language, science, and learner preferences.
- A subject-pack reference layer for deterministic evaluators and workspace descriptors.
- A generic workspace host that routes workspace descriptors to subject-specific renderers.
- A runnable static web shell prototype with math equal-groups, language token-selection, science classification-sort workspaces, a learner progress dashboard, a recent-session picker, a guardian preview, and a recent-work activity timeline.
- Formal live-state contracts for workspace snapshots, tutor policies, evaluation results, recoverable session records, device profiles, skill mastery, consent, safety, retention, and synthetic-only AI tutor evaluation.
- Node test coverage for the initial domain primitives.

## Core Contracts

| File | Purpose |
| --- | --- |
| `schemas/index.json` | Registers schema IDs, fixture suffixes, file paths, and prototype stability metadata. |
| `schemas/schema-registry.schema.json` | Defines the registry contract used by fixture validation. |
| `schemas/api-http-exchange.schema.json` | Defines portable HTTP request/response examples for API contract fixtures. |
| `schemas/learning-objective.schema.json` | Defines portable learning goals across subjects. |
| `schemas/problem.schema.json` | Defines prompts, answers, modalities, and workspace metadata. |
| `schemas/interaction-event.schema.json` | Defines append-only learner, AI, and UI events. |
| `schemas/tutor-response.schema.json` | Defines structured AI tutor output for text, speech, highlights, and next actions. |
| `schemas/tutor-quality-scorecard.schema.json` | Defines synthetic-only tutor response rubric scorecards for correctness, pedagogy, age fit, safety, contract fit, and UI actionability. |
| `schemas/learner-profile.schema.json` | Defines locale, accessibility, and learner preference metadata. |
| `schemas/device-profile.schema.json` | Defines runtime device categories, input modes, viewport constraints, and presentation modes. |
| `schemas/workspace-snapshot.schema.json` | Defines serializable live workspace state for replay, persistence, and AI context. |
| `schemas/tutor-policy.schema.json` | Defines answer reveal, hint, modality, and safety rules for tutoring behavior. |
| `schemas/evaluation-result.schema.json` | Defines deterministic evaluator output before tutor feedback or AI explanation. |
| `schemas/skill-mastery.schema.json` | Defines objective-level learner progress, mastery estimates, evidence, and next recommendations. |
| `schemas/progress-summary.schema.json` | Defines dashboard-facing learner progress aggregates across mastery records. |
| `schemas/tutor-context.schema.json` | Defines validated tutor/model context assembled from learner, device, problem, policy, event, evaluation, and progress state. |
| `schemas/consent-record.schema.json` | Defines guardian or learner consent scopes for AI tutoring, personalization, analytics, voucher billing, and data export. |
| `schemas/safety-policy.schema.json` | Defines age-band safety rules, blocked content categories, escalation triggers, and AI autonomy levels. |
| `schemas/safety-incident.schema.json` | Defines append-only safety, privacy, billing, accessibility, and escalation incident records. |
| `schemas/data-retention-policy.schema.json` | Defines retention, export, deletion, and audit rules for learner/session/progress/voucher/safety records. |
| `schemas/audit-event.schema.json` | Defines append-only operational audit events for learner, consent, session, voucher, safety, data, and AI actions. |
| `schemas/account.schema.json` | Defines provider-neutral guardian, educator, operator, and learner identity accounts. |
| `schemas/learner-account-link.schema.json` | Defines learner-scoped access relationships and permissions for accounts. |
| `schemas/session-record.schema.json` | Defines recoverable session state with append-oriented events and snapshot history. |
| `schemas/funding-source.schema.json` | Defines voucher, ESA, scholarship, or other homeschool funding programs. |
| `schemas/voucher-redemption.schema.json` | Defines voucher/ESA checkout, reimbursement, documentation, and status tracking. |
| `schemas/product-offering.schema.json` | Defines catalog items mapped to voucher/ESA eligible expense categories. |
| `schemas/checkout-session.schema.json` | Defines guardian checkout state with voucher funding selections and balance due. |
| `schemas/invoice.schema.json` | Defines auditable invoices generated from checkout and voucher funding selections. |
| `schemas/account-ledger-entry.schema.json` | Defines account ledger entries for charges, voucher credits, direct payments, reimbursements, refunds, and adjustments. |
| `src/core/domain.js` | Provides the JavaScript reference helpers for the contracts. |
| `src/core/subject-pack.js` | Provides the JavaScript reference interface for subject-specific evaluators and workspace descriptors. |
| `src/app/workspace-host.js` | Resolves workspace descriptors to registered renderers for the web shell. |
| `src/app/device-profile.js` | Infers computer, tablet, phone, and smart-glasses presentation modes for adaptive UI shells. |
| `src/app/progress-model.js` | Tracks objective-level mastery and dashboard progress summaries from deterministic evaluation results. |
| `src/app/tutor-context.js` | Builds bounded tutor context packages with consent/safety summaries for scripted or future AI tutor generation. |
| `src/app/consent-safety.js` | Provides consent scope checks, safety policy evaluation, incident creation, and retention-policy helpers. |
| `src/app/safety-operations.js` | Records blocked or escalated tutor safety outcomes as append-only incidents with optional audit events. |
| `src/app/identity-access.js` | Provides account, learner-link, consent authority, and learner permission helpers. |
| `src/app/audit-log.js` | Provides audit-event creation and summarization helpers for future service boundaries. |
| `src/app/session-access-service.js` | Wraps session persistence with learner-link authorization, consent checks, data-rights export packaging, and in-memory/file-backed audit event stores. |
| `src/app/session-http-api.js` | Exposes version-aware access-controlled session operations through dependency-free Fetch-style and Node `http` adapters. |
| `src/app/data-rights.js` | Creates session export packets with data-inventory classifications for data-rights workflows. |
| `src/app/recovery-drill.js` | Compares source and restored session services to verify synthetic backup/restore recovery for active records and deleted-session tombstones. |
| `src/app/model-gateway.js` | Provides a synthetic-only reference model gateway for tutor-response validation and safety checks without real learner data or provider calls. |
| `src/app/tutor-quality-evaluation.js` | Scores synthetic tutor responses against a deterministic quality rubric and compares baseline/candidate scorecards before provider-backed AI is considered. |
| `src/app/session-persistence.js` | Provides in-memory and browser-storage adapters for recoverable prototype sessions. |
| `src/app/session-service.js` | Provides a service boundary plus memory, overwrite-file, and append-only JSONL stores for durable-session prototypes, including optional consent-scope persistence guards. |
| `src/app/database-session-record-store.js` | Provides server-side SQLite-backed session and audit stores that apply `db/session-adapter.sql`, write materialized records plus append-only projections, persist audit decisions, export retention/tombstone views, run backup/restore smoke checks, and pass shared store/API reconciliation tests when `sqlite3` is available. |
| `src/app/voucher-acceptance.js` | Provides voucher/ESA funding-source and redemption helpers. |
| `src/app/voucher-checkout.js` | Provides product catalog and voucher checkout helpers. |
| `src/app/voucher-billing.js` | Provides invoice and account-ledger helpers for voucher/ESA billing reconciliation. |
| `src/app/voucher-operations.js` | Creates sandbox-only voucher compliance packets and review packet stores before any real funds are accepted. |

## Architecture

Read `docs/base-layer-architecture.md` for the platform plan, service boundaries, UI base layer, subject extension model, and scale strategy. Read `docs/regulatory-assumptions.md` for the synthetic-data boundary and the COPPA/FERPA/SOPIPA/voucher assumptions that must be resolved before real learners. Read `docs/data-inventory.md` for the executable learner-data classification gate. Read `docs/build-vs-buy-strategy.md` for how reference implementations should become provider adapters if this becomes a venture. Read `docs/product-validation-plan.md` for learner, guardian, channel, and tutor-quality validation gates. Read `docs/ai-tutor-evaluation.md` for the synthetic-only model-gateway rubric and scorecard harness. Read `docs/technical-evaluation.md` for the current quality assessment, known risks, and recommended next build sequence. Read `docs/subject-pack-development.md` for the subject-pack model now used by the examples and tests. Read `docs/progress-evaluation.md` for the latest maturity assessment and recommended next milestone. Read `docs/web-shell-prototype.md` for the runnable learner-facing prototype. Read `docs/current-progress-analysis.md` for the current progress review and next-level development recommendation. Read `docs/live-state-contracts.md` for the live workspace, policy, and evaluation contracts. Read `docs/session-persistence-service.md` for the next persistence-service boundary. Read `docs/session-recovery-drills.md` for synthetic backup/restore recovery checks. Read `docs/database-session-adapter.md` and `db/session-adapter.sql` for the production database adapter plan, baseline storage shape, and acceptance gates. Read `docs/device-support.md` for the computer/tablet/phone/smart-glasses adaptation strategy. Read `docs/strategic-implementation-plan.md` for the prioritized implementation sequence for progress, dashboards, tutor context, safety, content, and pilots. Read `docs/production-readiness-roadmap.md` for completed work, remaining work, release gates, and a production-readiness timeline. Read `docs/browser-automation.md` for the real-browser QA gate. Read `docs/audit-events.md` for the append-only audit event contract. Read `docs/session-access-service.md` for the access-controlled session service boundary. Read `docs/session-http-api.md` for the dependency-free HTTP adapter over that boundary. Read `docs/identity-access.md` for guardian/educator identity and learner access scaffolding. Read `docs/voucher-acceptance.md` for the homeschool voucher/ESA acceptance plan. Read `docs/consent-safety.md` for the consent, privacy, safety, incident, retention, and safety-operations base layer.

## Current Mode and Real-Data Boundary

This repository is currently a synthetic-data architecture/portfolio prototype. Do not use real minor PII, real guardian/school records, real voucher/ESA funds, real payment credentials, or live child-facing AI output until regulatory assumptions, production consent/authority, retention/export/delete, safety operations, voucher/payment compliance, and provider-adapter decisions are reviewed.

## Development

Run the static web shell:

```bash
npm start
```

Then open `http://localhost:4173/app/`.

Run the local SQLite-backed session API prototype:

```bash
npm run start:session-api
```

The session API listens on `http://127.0.0.1:4180` by default, stores records in `.data/session-api.sqlite`, and uses the demo guardian/account/consent fixtures with a local bearer token for `/sessions` requests.

Validate the schema registry and example fixtures:

```bash
npm run validate:fixtures
```

Validate the learner-data inventory coverage and real-data gates:

```bash
npm run validate:data-inventory
```

Replay the session HTTP API contract fixtures against the dependency-free Fetch adapter:

```bash
npm run replay:api-fixtures
```

Run the test suite:

```bash
npm test
```

Run the DOM-oriented product-flow smoke tests:

```bash
npm run test:browser
```

Install and run real-browser Playwright QA:

```bash
npm run test:e2e:install
npm run test:e2e
```

Run the dependency-free device QA preset checks for desktop, tablet, phone, and smart-glasses layouts:

```bash
npm run test:device
```

The code intentionally avoids runtime dependencies at this stage so the base layer remains easy to port to other languages and services.
