import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createInitialLearningSession,
  placeSelectedCounter,
  selectCounter,
} from '../src/app/learning-session.js';
import {
  createAppendOnlyFileSessionRecordStore,
  createFileSessionRecordStore,
  createInMemorySessionRecordStore,
  createSessionPersistenceService,
} from '../src/app/session-service.js';
import { createConsentRecord, createSafetyPolicy, revokeConsent } from '../src/app/consent-safety.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';
import { createDeletionTombstone } from '../src/app/data-retention.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const sessionRecordSchema = readJson('schemas/session-record.schema.json');
const fixedNow = () => '2026-05-28T00:00:00.000Z';


function createTombstone(record, deletedAt = '2026-05-28T01:00:00.000Z') {
  return createDeletionTombstone({
    sessionRecord: record,
    deletedAt,
    deletedByAccountId: 'guardian_service_001',
    traceId: 'trace_service_delete_001',
    reason: 'test deletion',
  });
}

function createMathSession(sessionId = 'ses_service_math_001') {
  return createInitialLearningSession({
    sessionId,
    learnerId: 'learner_service_001',
    objective,
    problem,
    now: fixedNow,
  });
}

test('service saves sessions as schema-compatible records and filters them', async () => {
  const service = createSessionPersistenceService({ now: fixedNow });
  let session = createMathSession();

  let record = await service.saveSession(session);
  session = selectCounter(session, 'counter_1');
  session = placeSelectedCounter(session, 'group_1', fixedNow);
  record = await service.saveSession(session);

  assert.deepEqual(validateJsonSchema(record, sessionRecordSchema), []);
  assert.equal(record.events.length, 2);
  assert.equal(record.snapshotHistory.length, 2);
  assert.equal(record.metadata.eventCount, 2);
  assert.equal(record.metadata.snapshotCount, 2);

  const learnerRecords = await service.listSessionRecords({ learnerId: 'learner_service_001' });
  assert.deepEqual(learnerRecords.map((storedRecord) => storedRecord.sessionId), [session.sessionId]);
  assert.deepEqual(await service.listSessionRecords({ subject: 'science' }), []);
});

test('service appends events and snapshots idempotently', async () => {
  const service = createSessionPersistenceService({ now: fixedNow });
  let session = createMathSession('ses_service_append_001');
  await service.saveSession(session);

  session = selectCounter(session, 'counter_2');
  session = placeSelectedCounter(session, 'group_2', fixedNow);
  const event = session.events.at(-1);

  let record = await service.appendInteractionEvent(session.sessionId, event);
  record = await service.appendInteractionEvent(session.sessionId, event);
  assert.equal(record.events.length, 2);

  record = await service.appendWorkspaceSnapshot(session.sessionId, session.workspaceSnapshot);
  record = await service.appendWorkspaceSnapshot(session.sessionId, session.workspaceSnapshot);
  assert.equal(record.snapshotHistory.length, 2);
  assert.deepEqual(record.currentWorkspaceSnapshot.state.groups[1].items, ['counter_2']);
});



test('service tracks record versions and rejects stale expected versions', async () => {
  const service = createSessionPersistenceService({ now: fixedNow });
  let session = createMathSession('ses_service_versioned_001');
  let record = await service.saveSession(session);

  assert.equal(record.metadata.recordVersion, 1);
  assert.equal(record.metadata.etag, 'W/"ses_service_versioned_001:1"');

  session = selectCounter(session, 'counter_4');
  session = placeSelectedCounter(session, 'group_1', fixedNow);
  record = await service.saveSession(session, { expectedRecordVersion: 1 });

  assert.equal(record.metadata.recordVersion, 2);
  assert.equal(record.metadata.etag, 'W/"ses_service_versioned_001:2"');

  await assert.rejects(
    () => service.appendInteractionEvent(session.sessionId, session.events.at(-1), { expectedRecordVersion: 1 }),
    /version conflict: expected 1, current 2/,
  );
});

test('service can require active consent before persisting learner session records', async () => {
  const consentRecord = createConsentRecord({
    id: 'consent_service_001',
    learnerId: 'learner_service_001',
    guardianId: 'guardian_service_001',
    grantedScopes: ['progress_tracking', 'personalization'],
    deniedScopes: ['analytics'],
    collectedAt: fixedNow(),
  });
  const safetyPolicy = createSafetyPolicy({
    id: 'safety.service.minor',
    learnerAgeBand: 'minor_under_13',
  });
  const service = createSessionPersistenceService({
    now: fixedNow,
    consentRecord,
    safetyPolicy,
    requiredConsentScopes: ['progress_tracking'],
  });

  const record = await service.saveSession(createMathSession('ses_service_consent_001'));

  assert.equal(record.metadata.consentSafetySummary.consentStatus, 'granted');
  assert.deepEqual(record.metadata.consentSafetySummary.activeScopes, ['personalization', 'progress_tracking']);
  assert.equal(record.metadata.consentSafetySummary.safetyPolicyId, 'safety.service.minor');
});

test('service rejects session persistence when required consent is revoked or belongs to another learner', async () => {
  const consentRecord = createConsentRecord({
    id: 'consent_service_002',
    learnerId: 'learner_service_001',
    guardianId: 'guardian_service_001',
    grantedScopes: ['progress_tracking'],
    collectedAt: fixedNow(),
  });
  const revokedConsent = revokeConsent(consentRecord, {
    revokedAt: '2026-05-28T01:00:00.000Z',
    reason: 'guardian_request',
  });
  const service = createSessionPersistenceService({
    now: fixedNow,
    requiredConsentScopes: ['progress_tracking'],
  });

  await assert.rejects(
    () => service.saveSession(createMathSession('ses_service_revoked_consent_001'), { consentRecord: revokedConsent }),
    /active consent is required/,
  );

  const mismatchedConsent = createConsentRecord({
    id: 'consent_service_003',
    learnerId: 'learner_other_001',
    grantedScopes: ['progress_tracking'],
    collectedAt: fixedNow(),
  });
  await assert.rejects(
    () => service.saveSession(createMathSession('ses_service_mismatched_consent_001'), { consentRecord: mismatchedConsent }),
    /does not match session learner/,
  );
});

test('file-backed record store persists records across service instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-session-service-'));
  try {
    const firstService = createSessionPersistenceService({
      recordStore: createFileSessionRecordStore({ directory }),
      now: fixedNow,
    });
    let session = createMathSession('ses_service_file_001');
    session = selectCounter(session, 'counter_3');
    session = placeSelectedCounter(session, 'group_3', fixedNow);
    const savedRecord = await firstService.saveSession(session);

    const secondService = createSessionPersistenceService({
      recordStore: createFileSessionRecordStore({ directory }),
      now: fixedNow,
    });
    const loadedRecord = await secondService.loadSessionRecord(session.sessionId);

    assert.deepEqual(loadedRecord.currentWorkspaceSnapshot.state.groups[2].items, ['counter_3']);
    assert.equal(loadedRecord.id, savedRecord.id);
    assert.deepEqual(validateJsonSchema(loadedRecord, sessionRecordSchema), []);

    const rawRecord = await readFile(join(directory, `${session.sessionId}.session-record.json`), 'utf8');
    assert.equal(JSON.parse(rawRecord).sessionId, session.sessionId);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test('file-backed record store persists deletion tombstones across service instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-session-tombstone-'));
  try {
    const firstService = createSessionPersistenceService({
      recordStore: createFileSessionRecordStore({ directory }),
      now: fixedNow,
    });
    const record = await firstService.saveSession(createMathSession('ses_service_file_tombstone_001'));
    const tombstone = createTombstone(record);
    await firstService.deleteSessionRecord(record.sessionId, { tombstone });

    const secondService = createSessionPersistenceService({
      recordStore: createFileSessionRecordStore({ directory }),
      now: fixedNow,
    });

    assert.equal(await secondService.loadSessionRecord(record.sessionId), null);
    assert.equal((await secondService.loadDeletedSessionTombstone(record.sessionId)).tombstoneId, tombstone.tombstoneId);
    assert.deepEqual((await secondService.listDeletedSessionTombstones()).map((entry) => entry.sessionId), [record.sessionId]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('append-only file record store materializes latest records and tombstones deletes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-session-append-only-'));
  try {
    const recordStore = createAppendOnlyFileSessionRecordStore({ directory });
    const firstService = createSessionPersistenceService({ recordStore, now: fixedNow });
    let session = createMathSession('ses_service_append_only_001');

    let savedRecord = await firstService.saveSession(session);
    session = selectCounter(session, 'counter_1');
    session = placeSelectedCounter(session, 'group_1', fixedNow);
    savedRecord = await firstService.saveSession(session, { expectedRecordVersion: 1 });

    const secondService = createSessionPersistenceService({
      recordStore: createAppendOnlyFileSessionRecordStore({ directory }),
      now: fixedNow,
    });
    const loadedRecord = await secondService.loadSessionRecord(session.sessionId);

    assert.equal(loadedRecord.metadata.recordVersion, 2);
    assert.equal(loadedRecord.metadata.etag, 'W/"ses_service_append_only_001:2"');
    assert.deepEqual(loadedRecord.currentWorkspaceSnapshot.state.groups[0].items, ['counter_1']);
    assert.deepEqual(validateJsonSchema(loadedRecord, sessionRecordSchema), []);

    const listedRecords = await secondService.listSessionRecords({ learnerId: 'learner_service_001' });
    assert.deepEqual(listedRecords.map((record) => record.sessionId), [session.sessionId]);

    const tombstone = createTombstone(savedRecord);
    await secondService.deleteSessionRecord(session.sessionId, { expectedRecordVersion: 2, tombstone });
    assert.equal(await secondService.loadSessionRecord(session.sessionId), null);
    assert.equal((await secondService.loadDeletedSessionTombstone(session.sessionId)).tombstoneId, tombstone.tombstoneId);
    assert.deepEqual((await secondService.listDeletedSessionTombstones({ learnerId: 'learner_service_001' })).map((entry) => entry.sessionId), [session.sessionId]);

    const rawEvents = (await readFile(join(directory, 'session-record-events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(rawEvents.map((event) => event.type), ['upsert', 'upsert', 'delete']);
    assert.equal(rawEvents[0].record.metadata.recordVersion, 1);
    assert.equal(rawEvents[1].record.metadata.recordVersion, savedRecord.metadata.recordVersion);
    assert.equal(rawEvents[2].sessionId, session.sessionId);
    assert.equal(rawEvents[2].tombstone.tombstoneId, tombstone.tombstoneId);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('service exposes delete and missing-record errors', async () => {
  const store = createInMemorySessionRecordStore();
  const service = createSessionPersistenceService({ recordStore: store, now: fixedNow });
  const session = createMathSession('ses_service_delete_001');

  await service.saveSession(session);
  await service.deleteSessionRecord(session.sessionId);

  assert.equal(await service.loadSessionRecord(session.sessionId), null);
  await assert.rejects(
    () => service.appendWorkspaceSnapshot(session.sessionId, session.workspaceSnapshot),
    /session record ses_service_delete_001 was not found/,
  );
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
