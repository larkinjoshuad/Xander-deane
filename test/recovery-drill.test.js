import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createDeletionTombstone } from '../src/app/data-retention.js';
import { createInitialLearningSession } from '../src/app/learning-session.js';
import {
  createSessionRecoveryDrillReport,
  runSessionRecoveryDrill,
} from '../src/app/recovery-drill.js';
import { createSessionPersistenceService } from '../src/app/session-service.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const checkedAt = '2026-06-01T00:00:00.000Z';
const fixedNow = () => checkedAt;

test('session recovery drill passes when active records and tombstones match', async () => {
  const sourceService = createSessionPersistenceService({ now: fixedNow });
  const restoredService = createSessionPersistenceService({ now: fixedNow });
  await seedService(sourceService);
  await seedService(restoredService);

  const report = await runSessionRecoveryDrill({
    sourceService,
    restoredService,
    checkedAt,
    scope: 'memory_store_restore_drill',
  });

  assert.equal(report.status, 'passed');
  assert.deepEqual(report.counts, {
    sourceActiveRecords: 1,
    restoredActiveRecords: 1,
    sourceTombstones: 1,
    restoredTombstones: 1,
    mismatches: 0,
  });
  assert.deepEqual(report.activeSessions.map((entry) => entry.status), ['matched']);
  assert.deepEqual(report.tombstones.map((entry) => entry.status), ['matched']);
  assert.deepEqual(report.mismatches, []);
});

test('session recovery drill reports missing restored records and tombstones', async () => {
  const sourceService = createSessionPersistenceService({ now: fixedNow });
  const restoredService = createSessionPersistenceService({ now: fixedNow });
  await seedService(sourceService);

  const report = await runSessionRecoveryDrill({
    sourceService,
    restoredService,
    checkedAt,
  });

  assert.equal(report.status, 'failed');
  assert.equal(report.counts.mismatches, 2);
  assert.deepEqual(report.mismatches.map((entry) => [entry.type, entry.sessionId, entry.status]), [
    ['active_session', 'ses_recovery_active_001', 'missing_restored'],
    ['deleted_session_tombstone', 'ses_recovery_deleted_001', 'missing_restored'],
  ]);
});

test('session recovery drill report flags restored metadata drift', () => {
  const report = createSessionRecoveryDrillReport({
    checkedAt,
    sourceRecords: [{ sessionId: 'ses_recovery_drift_001', metadata: { recordVersion: 2, etag: 'W/"a"' } }],
    restoredRecords: [{ sessionId: 'ses_recovery_drift_001', metadata: { recordVersion: 1, etag: 'W/"b"' } }],
  });

  assert.equal(report.status, 'failed');
  assert.equal(report.activeSessions[0].status, 'metadata_mismatch');
  assert.equal(report.mismatches[0].reason, 'active record version or ETag differs after restore');
});

async function seedService(service) {
  await service.saveSession(createMathSession('ses_recovery_active_001'));
  const deletedRecord = await service.saveSession(createMathSession('ses_recovery_deleted_001'));
  const tombstone = createDeletionTombstone({
    sessionRecord: deletedRecord,
    deletedAt: checkedAt,
    deletedByAccountId: 'guardian_recovery_001',
    traceId: 'trace_recovery_delete_001',
    reason: 'recovery drill fixture',
  });
  await service.deleteSessionRecord(deletedRecord.sessionId, {
    expectedRecordVersion: deletedRecord.metadata.recordVersion,
    tombstone,
  });
}

function createMathSession(sessionId) {
  return createInitialLearningSession({
    sessionId,
    learnerId: 'learner_recovery_001',
    objective,
    problem,
    now: fixedNow,
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
