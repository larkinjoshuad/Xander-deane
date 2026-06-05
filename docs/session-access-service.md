# Access-Controlled Session Service

The prototype session service can save, list, load, append, export, tombstone-query, and delete session records, but production endpoints also need account authorization, active learner links, consent checks, data-rights packaging, retention/deletion policy, and append-only audit events. `src/app/session-access-service.js` adds that service-facing guardrail without introducing a web framework or database dependency.

## Runtime helpers

| Helper | Purpose |
| --- | --- |
| `createAccessControlledSessionService` | Wraps a session persistence service and enforces learner-link permissions, required consent scopes, and audit-event recording around session operations. |
| `createInMemoryAuditEventStore` | Stores audit events in memory for tests and local prototypes. Production adapters should replace this with append-only durable storage. |
| Retention policy support | Accepts a `DataRetentionPolicy` in service options or request context, includes retention disposition in exports, denies expired ordinary exports, and returns deletion tombstones for destructive deletes. |

## Guarded operations

The access-controlled service currently guards:

1. `saveSession` with `manage_sessions` and `progress_tracking` consent;
2. `loadSessionRecord` with `manage_sessions`;
3. `appendInteractionEvent` with `manage_sessions` and `progress_tracking` consent;
4. `appendWorkspaceSnapshot` with `manage_sessions` and `progress_tracking` consent;
5. `listSessionRecords` with `manage_sessions`;
6. `exportSessionRecord` with `export_data` and `data_export` consent;
7. `loadDeletedSessionTombstone` and `listDeletedSessionTombstones` with `manage_sessions`;
8. `deleteSessionRecord` with `delete_data`.

Every allowed or denied decision emits an `AuditEvent` with account, learner, permission, consent scope, decision, reason, and trace metadata.

## Production adapter expectations

A production HTTP/database adapter should keep this authorization sequence at the edge of every learner-scoped endpoint:

1. authenticate the account;
2. load the active `LearnerAccountLink` for the learner;
3. verify the needed learner permission;
4. verify the needed consent scope when the operation writes learner progress/session data or exports learner records;
5. attach data-inventory classifications and retention disposition to export packets so callers know which records remain synthetic/review-gated and when deletion is recommended;
6. deny ordinary exports when retention has expired and record that denial in the audit trail;
7. keep active session listings separate from deleted tombstone listings;
8. return a deletion tombstone containing source version, actor, trace, reason, and retention status for destructive deletes;
9. write the audit event append-only before returning success or denial;
10. write session events/snapshots append-only with version conflict checks.

The in-memory audit store is only for local tests. Real storage should be immutable, queryable by learner/account/trace ID, and protected from raw prompt, payment, or private-document payloads.
