# Session Persistence Service Boundary

The next product leap is separating learning-session recovery from browser-local storage. The repository now includes a small service boundary that can run over memory, overwrite-file, append-only JSONL, or SQLite-backed stores while preserving the same `SessionRecord` contract used by the web prototype.

## Why This Exists

`SessionRecord` makes the learner state recoverable, but browser storage is only a prototype adapter. A real product needs a stable boundary that can later be backed by a database, object store, event stream, or offline-sync service without rewriting the learning runtime.

## Service Responsibilities

`src/app/session-service.js` exposes a persistence service with these operations:

- `saveSession(session)` creates or updates a schema-compatible `SessionRecord` from a live learning session.
- `saveSessionRecord(record)` writes a prebuilt session record.
- `loadSessionRecord(sessionId)` loads one recoverable session record.
- `listSessionRecords(filter)` returns records by learner, subject, workspace kind, or problem.
- `deleteSessionRecord(sessionId)` removes a record.
- `appendInteractionEvent(sessionId, event)` appends one event idempotently.
- `appendWorkspaceSnapshot(sessionId, snapshot)` appends a snapshot idempotently and updates the current snapshot.

## Included Stores

| Store | Purpose |
| --- | --- |
| `createInMemorySessionRecordStore` | Fast unit-test and process-local reference store. |
| `createFileSessionRecordStore` | Node development adapter that writes one `.session-record.json` file per session. |
| `createAppendOnlyFileSessionRecordStore` | Node development adapter that appends upsert/delete entries to a JSONL log and materializes the latest active records on read. |
| `createSqliteSessionRecordStore` | Server-side SQLite adapter in `src/app/database-session-record-store.js` that applies `db/session-adapter.sql`, writes materialized records plus append-only projections, and can be translated to a production database. |


## Runnable Local Session API

The repository now includes `scripts/session-api-server.js` for pilot-style local development against the same HTTP boundary used by API fixture replay. It starts a Node `http` server over the access-controlled session API, uses the SQLite session/audit stores, and loads the demo guardian account, learner link, and consent fixture for authenticated requests.

```bash
npm run start:session-api
```

Configuration is intentionally explicit:

- `SESSION_API_PORT` sets the local port, defaulting to `4180`.
- `SESSION_API_DB` sets the SQLite database path, defaulting to `.data/session-api.sqlite`.
- `SESSION_API_TOKEN` sets the bearer token required by `/sessions` requests, defaulting to `prototype-dev-token` for local-only development.

The server exposes `GET /healthz` without authentication and requires `Authorization: Bearer <SESSION_API_TOKEN>` plus the fixture account/learner headers for session operations. This is not production auth; it is a concrete bridge from browser-local prototype recovery toward an authenticated service boundary.

## Adapter Conformance

All current and future stores should satisfy the shared adapter behavior exported by `test/helpers/session-record-store-contract.js` and exercised in `test/session-record-store-contract.test.js`, which verifies save/update, schema compatibility, reload, learner-filtered listing, optimistic versions, idempotent event/snapshot appends, and delete semantics across memory, overwrite-file, append-only JSONL, and SQLite database stores when `sqlite3` is available.

## Production Direction

The service boundary is intentionally minimal. The next production implementation should preserve the same operations while adding:

1. authenticated learner/session ownership,
2. database-backed append-only event and snapshot storage that preserves the JSONL adapter semantics,
3. optimistic concurrency or version checks,
4. retention and deletion policy,
5. encryption and access auditing,
6. analytics-safe derived-event pipelines,
7. offline sync conflict handling.

## AI Readiness

The future tutor model should read from a service-backed `SessionRecord`, not from transient UI state. This keeps AI context replayable, inspectable, and constrained by deterministic evaluator output and tutor policy.

## Lifecycle Listings and Tombstones

Session stores now expose active-record listings separately from deleted-session tombstones. `listSessionRecords` returns active records only, while `loadDeletedSessionTombstone` and `listDeletedSessionTombstones` expose deletion tombstones for authorized governance, audit, and recovery-planning paths. In-memory, file, append-only JSONL, and SQLite stores preserve tombstone metadata when callers pass the access-service deletion tombstone into `deleteSessionRecord`. Recovery remains policy-gated and synthetic-only until authority, retention, and audit semantics are reviewed; `src/app/recovery-drill.js` now verifies that backup/restore candidates preserve active-record and deleted-tombstone views before any production adapter can claim recoverability.
