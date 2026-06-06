# Database Session Adapter Plan

The repository now includes a first server-side SQLite-backed database adapter that preserves the existing `SessionRecord` service contract while replacing local memory/file stores with durable SQL storage. This document defines the adapter contract, storage model, acceptance checks, and remaining hardening work before it can support real learner data.

## Goals

- Preserve the same service operations exposed by `src/app/session-service.js` and `src/app/session-http-api.js`.
- Keep append-only event and workspace-snapshot history so learner state is replayable, auditable, and safe for future AI context.
- Enforce optimistic version checks with the same `recordVersion` and ETag semantics used by the existing service.
- Support learner/session ownership, consent references, retention/deletion policy, and audit correlation without storing real learner data in prototype tests.

## Store Contract

Every production adapter must satisfy the shared session-record store behavior exposed by `test/helpers/session-record-store-contract.js` and exercised today by `test/session-record-store-contract.test.js`:

1. save an initial schema-valid `SessionRecord`,
2. update the same record with an incremented `metadata.recordVersion`,
3. reload records through a fresh adapter instance,
4. reject stale writes through the service version checks,
5. append duplicate interaction events and workspace snapshots idempotently,
6. list records by learner filter,
7. delete records and remove them from filtered list results.

## Proposed Tables or Collections

A baseline portable SQL shape is available in `db/session-adapter.sql`; `src/app/database-session-record-store.js` applies that shape to SQLite for local/server-side tests. Production adapters may translate data types to their chosen database as long as table names, required columns, append-only semantics, and indexes remain equivalent.

| Table / collection | Purpose | Required fields |
| --- | --- | --- |
| `session_records` | Latest materialized state for fast reads and list views. | `session_id`, `learner_id`, `subject`, `problem_id`, `workspace_kind`, `record_version`, `etag`, `updated_at`, `record_json`, `deleted_at` |
| `session_record_events` | Append-only write log for upserts and tombstones. | `event_id`, `session_id`, `type`, `record_version`, `occurred_at`, `record_json`, `actor_account_id`, `trace_id` |
| `workspace_snapshots` | Append-only snapshot history for recovery and replay. | `snapshot_id`, `session_id`, `record_version`, `created_at`, `snapshot_json` |
| `interaction_events` | Append-only learner/tutor interaction history. | `interaction_event_id`, `session_id`, `learner_id`, `problem_id`, `type`, `modality`, `occurred_at`, `payload_json` |
| `audit_events` | Operational audit trail for access, consent, safety, and data actions. | `audit_event_id`, `learner_id`, `actor_account_id`, `action`, `decision`, `occurred_at`, `trace_id`, `metadata_json` |

## Transaction Rules

- A session update must write the materialized `session_records` row and append the corresponding `session_record_events` entry in one transaction.
- `record_version` must increment by exactly one for every persisted upsert.
- Deletes must append a tombstone event and mark the materialized row with `deleted_at`; physical deletion is a retention-policy job, not the request path.
- Appending interaction events or workspace snapshots must be idempotent by event/snapshot ID.
- List queries must exclude tombstoned rows unless a privileged audit/export path explicitly asks for deleted records.

## Security and Privacy Requirements

- The adapter must run behind the access-controlled session service, not directly from UI code.
- Every write must carry actor/account context, learner ownership context, and a trace ID; SQLite audit reconciliation now verifies allowed writes, deletes, consent-revocation denials, learner-ownership denials, and missing-permission denials are stored beside session events in a shared database during tests.
- Consent and retention references should be stored as metadata pointers; consent evaluation remains in the consent/safety layer.
- Data export and deletion jobs must use the same audit-event contract as normal session access.

## Acceptance Gates

Before this adapter can support any real learner pilot, it must pass:

1. the shared session-record store contract tests against a test database (SQLite now runs in `test/session-record-store-contract.test.js` when the `sqlite3` CLI is available),
2. API fixture replay through the authenticated HTTP adapter against both the default Fetch harness and the SQLite-backed session service,
3. stale-version and missing-precondition tests,
4. consent-revocation and learner-ownership denial tests (covered by the SQLite audit reconciliation test),
5. retention/tombstone export tests (covered by the SQLite retention export test),
6. backup/restore smoke tests and session recovery-drill reports that compare active records and deleted-session tombstones (covered by SQLite backup/restore smoke tests and `src/app/recovery-drill.js`),
7. audit-event reconciliation checks for every write and delete (SQLite reconciliation now covers create, append event, append snapshot, delete, missing-permission denial, revoked-consent denial, and wrong-learner denial paths).

## Implementation Sequence

1. Keep the SQLite-backed `SessionRecordStore` adapter behind the existing service shape and use it as the executable reference for SQL persistence.
2. Continue running the shared store contract tests against memory, overwrite-file, append-only JSONL, and SQLite database adapters.
3. Wire the database adapter into the access-controlled session HTTP API in a server-only module.
4. Continue expanding authenticated API fixtures for create/read/list/append/delete flows against the database-backed HTTP service.
5. Keep the consent-revocation, learner-ownership denial, retention export, backup/restore, and recovery-drill checks in CI while adding migration dry-runs, encrypted backups, restore drills, and retention job scheduling before any real learner data is accepted.
