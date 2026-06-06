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
