# Consent, Privacy, and Safety Base Layer

This project is moving from a runnable learning prototype toward a product that may handle minor learners, AI tutor responses, progress records, and voucher-funded purchases. The next production gate is therefore consent and safety, not more subject content.

## Why this layer exists

- **Minors require explicit guardrails.** AI tutoring, progress tracking, billing, analytics, and notifications must be gated by guardian or authorized-school consent.
- **Tutor context must be minimized.** Model gateways should receive only the consented, relevant context needed to help the learner.
- **Safety events must be auditable.** Blocked tutor responses, privacy requests, learner distress, and billing disputes need append-only incident records.
- **Retention must be policy-driven.** Deletion/export behavior should not be hard-coded into individual features.

## New contracts

| Contract | Purpose |
| --- | --- |
| `ConsentRecord` | Stores granted/denied scopes, source, status, expiration, and revocation state. |
| `SafetyPolicy` | Describes age band, allowed/blocked content, escalation triggers, and AI autonomy level. |
| `SafetyIncident` | Captures append-only safety/privacy/billing/accessibility incidents for audit and escalation. |
| `DataRetentionPolicy` | Defines record-specific retention, export, deletion, and audit behavior. |

## Runtime behavior

`src/app/consent-safety.js` provides dependency-free helpers to:

1. create immutable consent, safety, incident, and retention records;
2. check whether a consent scope is currently active;
3. revoke consent while preserving audit metadata;
4. evaluate tutor responses against requested consent scopes, blocked content categories, and escalation triggers;
5. summarize consent/safety state for a future model gateway or audit log.



`src/app/safety-operations.js` builds on those helpers with a synthetic-first operations boundary that:

1. records blocked or escalated tutor outcomes as append-only `SafetyIncident` records;
2. maps blocked reasons and escalation triggers into severity, category, trigger, and action fields;
3. persists incidents in memory or JSONL files for prototype/server tests;
4. optionally writes `safety.incident.create` audit events for operational review queues; and
5. skips incident creation for allowed tutor responses so the incident log stays focused on actionable safety outcomes.

`src/app/tutor-context.js` now embeds that consent/safety summary in every `TutorContext`, and `src/app/session-service.js` can require active consent scopes before saving session records, events, or snapshots. This keeps the safety layer on the critical path instead of leaving it as a standalone helper.

## Pre-Persistence Risk Gate

Engineering work may continue with synthetic fixtures, but real learner data should not enter session storage, tutor context, analytics, voucher flows, or audit exports until the team has implemented and reviewed: data classification, guardian/school authority, consent scope capture, retention policy, export/delete operations, safety escalation, and voucher/payment compliance controls. Browser tests and database durability do not by themselves make the system safe for minor PII.

## Production guidance

Before real pilots, every learner session should have:

1. an active `ConsentRecord` for required scopes;
2. a selected `SafetyPolicy` for learner age band and deployment context;
3. a retention policy for learner/session/progress/voucher/safety records;
4. a persisted consent/safety summary on session records and tutor context;
5. a safety evaluation before free-form AI tutor output is shown;
6. incident creation whenever tutor output is blocked, escalated, or reviewed, with audit evidence for human-review queues.

These contracts are implementation scaffolding and are not legal advice. Real deployments still need counsel-approved privacy notices, state/provider voucher requirements, data-processing agreements, and incident-response operations.
