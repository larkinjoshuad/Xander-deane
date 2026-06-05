import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import {
  createInitialLearningSession,
  placeSelectedCounter,
  selectCounter,
} from '../src/app/learning-session.js';
import { createSqliteSessionRecordStore } from '../src/app/database-session-record-store.js';
import { createSessionPersistenceService } from '../src/app/session-service.js';
import { createDeletionTombstone } from '../src/app/data-retention.js';

const execFileAsync = promisify(execFile);
const hasSqlite = await execFileAsync('sqlite3', ['-version']).then(() => true, () => false);
const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const now = () => '2026-05-30T00:00:00.000Z';

test('sqlite session record store writes materialized records and append-only projections', { skip: !hasSqlite }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-sqlite-store-'));
  const databasePath = join(directory, 'session-records.sqlite');
  try {
    const recordStore = createSqliteSessionRecordStore({ databasePath, now });
    const service = createSessionPersistenceService({ recordStore, now });
    let session = createInitialLearningSession({
      sessionId: 'ses_sqlite_contract_001',
      learnerId: 'learner_sqlite_001',
      objective,
      problem,
      now,
    });

    let record = await service.saveSession(session);
    session = placeSelectedCounter(selectCounter(session, 'counter_1'), 'group_1', now);
    record = await service.saveSession(session, { expectedRecordVersion: record.metadata.recordVersion });

    assert.equal(await scalar(databasePath, 'SELECT COUNT(*) AS count FROM session_records WHERE deleted_at IS NULL'), 1);
    assert.equal(await scalar(databasePath, 'SELECT COUNT(*) AS count FROM session_record_events WHERE type = \'upsert\''), 2);
    assert.equal(await scalar(databasePath, 'SELECT COUNT(*) AS count FROM workspace_snapshots'), 1);
    assert.equal(await scalar(databasePath, 'SELECT COUNT(*) AS count FROM interaction_events'), 2);

    const reloaded = await createSessionPersistenceService({
      recordStore: createSqliteSessionRecordStore({ databasePath, initialize: false, now }),
      now,
    }).loadSessionRecord(session.sessionId);
    assert.deepEqual(reloaded, record);

    const tombstone = createDeletionTombstone({
      sessionRecord: record,
      deletedAt: now(),
      deletedByAccountId: 'guardian_sqlite_001',
      traceId: 'trace_sqlite_delete_001',
      reason: 'sqlite tombstone test',
    });
    await service.deleteSessionRecord(session.sessionId, { expectedRecordVersion: record.metadata.recordVersion, tombstone });
    assert.equal(await service.loadSessionRecord(session.sessionId), null);
    assert.equal(await scalar(databasePath, 'SELECT COUNT(*) AS count FROM session_records WHERE deleted_at IS NOT NULL'), 1);
    assert.equal(await scalar(databasePath, 'SELECT COUNT(*) AS count FROM session_record_events WHERE type = \'delete\''), 1);
    assert.equal((await service.loadDeletedSessionTombstone(session.sessionId)).tombstoneId, tombstone.tombstoneId);
    assert.deepEqual((await service.listDeletedSessionTombstones({ learnerId: 'learner_sqlite_001' })).map((entry) => entry.sessionId), [session.sessionId]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function scalar(databasePath, sql) {
  const { stdout } = await execFileAsync('sqlite3', ['-json', '--', databasePath, sql]);
  return JSON.parse(stdout)[0].count;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
