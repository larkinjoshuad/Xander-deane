import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createInitialLearningSession } from '../src/app/learning-session.js';
import { createSessionRecord } from '../src/app/session-persistence.js';
import {
  assertExportAllowedByRetention,
  createDeletionTombstone,
  evaluateRetentionDisposition,
} from '../src/app/data-retention.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const retentionPolicy = readJson('examples/safety/session.data-retention-policy.json');
const fixedNow = () => '2026-05-31T00:00:00.000Z';

function createRecord(sessionId = 'ses_retention_001') {
  const session = createInitialLearningSession({
    sessionId,
    learnerId: 'learner_retention_001',
    objective,
    problem,
    now: fixedNow,
  });
  return createSessionRecord(session, { now: fixedNow });
}

test('evaluates active retention disposition for session records', () => {
  const record = createRecord();
  const disposition = evaluateRetentionDisposition({
    record,
    retentionPolicy,
    evaluatedAt: '2026-06-01T00:00:00.000Z',
  });

  assert.equal(disposition.status, 'active');
  assert.equal(disposition.policyId, retentionPolicy.id);
  assert.equal(disposition.recordType, 'session_record');
  assert.equal(disposition.retainedFrom, '2026-05-31T00:00:00.000Z');
  assert.equal(disposition.expiresAt, '2027-05-31T00:00:00.000Z');
  assert.equal(disposition.deletionRecommended, false);
  assertExportAllowedByRetention(disposition);
});

test('marks expired records and blocks ordinary guardian exports', () => {
  const record = createRecord('ses_retention_expired_001');
  const disposition = evaluateRetentionDisposition({
    record,
    retentionPolicy,
    evaluatedAt: '2027-06-01T00:00:00.000Z',
  });

  assert.equal(disposition.status, 'deletion_recommended');
  assert.equal(disposition.expired, true);
  assert.equal(disposition.deletionRecommended, true);
  assert.throws(
    () => assertExportAllowedByRetention(disposition),
    /retention expired/,
  );
});

test('creates deletion tombstones with source version and retention disposition', () => {
  const record = createRecord('ses_retention_tombstone_001');
  const disposition = evaluateRetentionDisposition({
    record,
    retentionPolicy,
    evaluatedAt: '2026-06-01T00:00:00.000Z',
  });
  const tombstone = createDeletionTombstone({
    sessionRecord: record,
    retentionDisposition: disposition,
    deletedAt: '2026-06-01T00:00:00.000Z',
    deletedByAccountId: 'guardian_retention_001',
    traceId: 'trace_retention_delete_001',
    reason: 'guardian request',
  });

  assert.equal(tombstone.sessionId, record.sessionId);
  assert.equal(tombstone.learnerId, record.learnerId);
  assert.equal(tombstone.deletedByAccountId, 'guardian_retention_001');
  assert.equal(tombstone.reason, 'guardian request');
  assert.equal(tombstone.retentionDisposition.status, 'active');
  assert.equal(tombstone.metadata.sourceRecordVersion, record.metadata.recordVersion ?? null);
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
