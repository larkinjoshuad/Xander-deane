# Session Write Concurrency

The persistence service passes the version it actually read to every save and
delete operation. Storage adapters check that precondition at the write boundary.
A competing writer receives SessionRecordVersionConflictError (HTTP 409 through
the session API). Reload the session and deliberately retry the operation against
its current version; do not retry an old whole-session snapshot blindly.

The adapter options use expectedRecordVersion as follows:

- An integer requires an active record with that version.
- null requires that no active record exists (create-only).
- Omission preserves unconditional direct-adapter writes for fixture setup and
  existing callers. Service writes always supply a precondition.

Memory compares and writes without yielding. File stores use an exclusive mkdir
lock around comparison and mutation, shared by independent instances and
processes targeting the same store. Contention fails immediately as a conflict.
The overwrite adapter publishes record JSON with a temporary file and rename.
SQLite checks the version inside BEGIN IMMEDIATE before changing records or
projections. Batch input and -bail ensure a failed guard exits before further
statements and rolls back the open transaction.

File stores remain prototype adapters: their lock spans the store, so unrelated
session writes can conflict. A process crash can leave an empty lock directory
(.session-record-write-lock or the JSONL path plus .write-lock). Stop all writers,
inspect the store, and remove only that verified stale lock before restarting.
Locks are never automatically stolen. This change does not provide crash-atomic
record/tombstone pairs, automatic log repair, or protection against writers that
bypass these adapters. Custom adapters must implement the same atomic precondition
contract; a service-side version check alone is insufficient.

Shared adapter tests race event appends, snapshot updates against deletes, and
create-only writes across service instances. They verify one winner, conflict
errors, preserved events after a reload/retry, and lock release after rejection.
