# Audit Event Contract

Production learner systems need an append-only audit trail before real learner data, voucher funds, or AI tutor calls are enabled. This layer adds a portable `AuditEvent` contract and dependency-free helpers for recording who acted, which learner/resource was affected, why the action was allowed or denied, and which trace connects the action to service logs.

## Contract

`schemas/audit-event.schema.json` records:

- actor account and learner identifiers,
- action and resource type,
- optional permission and consent scope used for the decision,
- decision (`allowed`, `denied`, `logged`, or `escalated`),
- human-readable reason,
- trace ID for observability correlation,
- JSON metadata for adapter-specific details.

## Runtime helpers

`src/app/audit-log.js` provides:

1. `createAuditEvent` for generic service, safety, voucher, data, and AI audit events;
2. `createLearnerAccessAuditEvent` for account/link-derived learner access decisions;
3. `summarizeAuditTrail` for dashboards, tests, and compliance export previews.



`src/app/session-access-service.js` adds two audit-event store adapters used by guarded session operations:

- `createInMemoryAuditEventStore` for unit tests and local prototypes;
- `createFileAuditEventStore` for append-only JSONL audit trails that survive process restarts and can be inspected or exported during early service pilots.

`src/app/database-session-record-store.js` adds `createSqliteAuditEventStore`, which persists full audit-event JSON in the SQL `audit_events` table while also indexing learner, actor, action, decision, timestamp, and trace columns for reconciliation checks. The SQLite reconciliation tests now cover allowed writes/deletes plus missing-permission, revoked-consent, and wrong-learner denial audit events; session lifecycle tests also cover active-list and tombstone-list/read audit actions.

## Synthetic Review Auditing

The authorized tutor review service requires an explicit audit store; there is
no silent in-memory default. Supply `createFileAuditEventStore` for a local
synthetic JSONL log, or `createInMemoryAuditEventStore` explicitly in tests.
Protect the audit store from untrusted callers, including its clear/list methods.

Actions `tutor_review.create`, `tutor_review.read`, and
`tutor_review.adjudicate` use resource type `tutor_review_collection`.
Each invocation generates a fresh trace ID shared by its events:

- `allowed` with phase `authorized`: permission passed and the operation may
  proceed. For writes this is recorded under the review lock before persistence.
- `logged` with phase `completed`: the store operation returned successfully.
- `denied` with phase `denied`: authorization or reauthorization failed.
- `logged` with phase `failed`: validation, conflict, or another operation error.

The trusted synthetic reviewer ID is metadata, not an account ID. It remains
null until the first successful authorization; after revocation it identifies
the previously authorized reviewer, not a still-valid grant. No session tokens,
request-provided IDs, scorecard content, rationale, or exception messages are logged.
The resource ID is a fixed collection identifier. Write completion events add
the persisted, server-generated review ID to metadata; other events correlate
by invocation trace. Events carry
`metadata.syntheticOnly: true`.

Audit errors raise a redacted `REVIEW_AUDIT_UNAVAILABLE` with `traceId`.
Failure of the pre-operation event blocks a write or read. Failure of the
completion event raises the same error with `operationCompleted: true`:
the review may already be committed and must not be blindly retried. A false
flag means completion was not confirmed, not a universal rollback guarantee.
Inspect review history to reconcile uncertain outcomes. Denials still block
access if their audit event cannot be saved, but no durable denial event can be
promised while the sink is unavailable.

Review and audit storage are separate. The file review store now saves a write
completion event atomically with its review packet, allowing recovery as below.
Crashes may still leave an authorization event without a completion event in the
audit sink; audit availability is not proof of successful adjudication.
The existing file adapter is a prototype append
log, not tamper-proof, multi-host, or power-loss-tested storage. Production needs
transactional/idempotent delivery, restricted access, retention, monitoring, and
an immutable audit backend before real data is considered.

## Completion Recovery

The file review store keeps `auditCompletions` alongside scorecard and review
records. These schema-validated events are bound to the committed review ID,
action, permission, and synthetic reviewer. The same atomic replacement writes
the review and its completion event. No completion is replayable from a failed
write. Completion timestamps represent preparation immediately before commit,
not the later delivery/recovery time.

Trusted maintenance code can call:

```js
const result = await reviewStore.reconcileAuditEvents(auditEventStore);
// result: { delivered, inspected }
```

The sink must expose `listAuditEvents` and `saveAuditEvent`. Reconciliation reads
committed packets only, validates them, and delivers missing events with their
original IDs and trace IDs. It never replays adjudication or modifies reviews.
Matching events are skipped; an existing event with the same ID but different
content is an error. Retained outbox records also allow restoration to an empty
sink. Legacy packets without outbox records remain readable but cannot have
their missing history reconstructed. Read, denial, and failure events are not
recoverable through this write-completion outbox.

This is at-least-once delivery, not exactly-once delivery. A directory lock
serializes reconcilers on one host, but immediate service delivery can race
maintenance; consumers must deduplicate by event ID, or use an idempotent sink.
An interrupted reconciliation can be retried after inspecting/removing its
abandoned `.audit-reconcile.lock` with all maintenance workers stopped. Never
remove an active lock. Audit sink failures propagate; already-delivered events
remain valid and are skipped on retry. Run this only as trusted maintenance,
not as a public or reviewer-authorized endpoint. No real data is enabled.

## Required first production audit points

Before accepting real learner data, service endpoints should emit audit events for:

1. session create/read/list/delete and deleted-session tombstone read/list;
2. interaction-event and workspace-snapshot append operations;
3. consent grant/revoke decisions;
4. learner-account link creation or permission updates;
5. voucher checkout, refund, invoice, and ledger actions;
6. safety incident creation and escalation;
7. data export/delete requests;
8. AI request/response gateway decisions.

Audit events should be stored append-only, durably, and correlated with server logs by `traceId`. They should not contain raw model prompts, full learner work, private documents, or payment credentials in `metadata`; use resource IDs and secure storage references instead.
