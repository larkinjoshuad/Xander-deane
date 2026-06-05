# Session Recovery Drills

Session persistence now has enough lifecycle metadata to verify backup/restore behavior without using real learner data. Recovery drills are synthetic-only checks that compare a source service with a restored service and produce a deterministic report.

## What the Drill Checks

`src/app/recovery-drill.js` compares:

1. active session IDs,
2. active session `recordVersion` and ETag metadata,
3. deleted-session tombstone IDs,
4. deleted-session tombstone deletion timestamps, and
5. mismatch counts suitable for CI assertions.

A passing report means the restored service exposes the same active session view and the same deleted-session tombstone view as the source service. It does **not** approve undeleting data or collecting real learner data.

## Intended Usage

1. Seed or operate on a synthetic source store.
2. Run the adapter-specific backup and restore process.
3. Wrap the restored store in the same session service shape.
4. Call `runSessionRecoveryDrill({ sourceService, restoredService })`.
5. Fail CI or the release checklist if the report status is `failed`.

## Production Readiness Boundary

Recovery drills are a governance gate, not a product feature. Before real learner data, production adapters still need encrypted backups, restore-time access controls, incident response ownership, retention/legal-hold review, and a documented decision for whether deleted records can ever be restored or only tombstoned for audit.
