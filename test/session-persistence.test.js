import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createInitialLearningSession,
  placeSelectedCounter,
  selectCounter,
} from '../src/app/learning-session.js';
import {
  createBrowserSessionStore,
  createInMemorySessionStore,
  createSessionRecord,
  rehydrateLearningSession,
} from '../src/app/session-persistence.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const fixedNow = () => '2026-05-28T00:00:00.000Z';
const sessionRecordSchema = readJson('schemas/session-record.schema.json');

function createMathSession() {
  return createInitialLearningSession({
    sessionId: 'ses_persistence_math_001',
    objective,
    problem,
    now: fixedNow,
  });
}

test('creates schema-compatible session records with append-only snapshots and events', () => {
  let session = createMathSession();
  let record = createSessionRecord(session, { now: fixedNow });

  session = selectCounter(session, 'counter_1');
  session = placeSelectedCounter(session, 'group_1', fixedNow);
  record = createSessionRecord(session, { previousRecord: record, now: fixedNow });

  assert.deepEqual(validateJsonSchema(record, sessionRecordSchema), []);
  assert.equal(record.events.length, 2);
  assert.equal(record.snapshotHistory.length, 2);
  assert.equal(record.currentWorkspaceSnapshot.state.groups[0].items[0], 'counter_1');
  assert.deepEqual(record.metadata, {
    source: 'session-persistence',
    eventCount: 2,
    snapshotCount: 2,
  });
});

test('rehydrates a fresh learning session from a persisted record', () => {
  let session = createMathSession();
  session = selectCounter(session, 'counter_1');
  session = placeSelectedCounter(session, 'group_1', fixedNow);
  const record = createSessionRecord(session, { now: fixedNow });
  const freshSession = createMathSession();

  const rehydratedSession = rehydrateLearningSession(freshSession, record);

  assert.equal(rehydratedSession.sessionId, freshSession.sessionId);
  assert.deepEqual(rehydratedSession.workspaceSnapshot.state.groups[0].items, ['counter_1']);
  assert.equal(rehydratedSession.events.at(-1).type, 'user_dragged');
  assert.throws(
    () => rehydratedSession.events.push(record.events[0]),
    /Cannot add property|object is not extensible/,
  );
});

test('stores and lists records with the in-memory session store', () => {
  const store = createInMemorySessionStore({ now: fixedNow });
  let session = createMathSession();

  let record = store.saveSession(session);
  session = selectCounter(session, 'counter_2');
  session = placeSelectedCounter(session, 'group_2', fixedNow);
  record = store.saveSession(session);

  assert.equal(store.loadSession(session.sessionId).events.length, 2);
  assert.equal(record.snapshotHistory.length, 2);
  assert.deepEqual(store.listSessions().map((savedRecord) => savedRecord.sessionId), [session.sessionId]);

  store.clearSession(session.sessionId);
  assert.equal(store.loadSession(session.sessionId), null);
});

test('stores records through the browser storage adapter namespace', () => {
  const storage = createFakeStorage();
  const store = createBrowserSessionStore({ namespace: 'test.learning', storage, now: fixedNow });
  const session = createMathSession();

  const record = store.saveSession(session);

  assert.equal(store.loadSession(session.sessionId).id, record.id);
  assert.deepEqual(store.listSessions().map((savedRecord) => savedRecord.sessionId), [session.sessionId]);
  assert.equal(storage.getItem(`test.learning:record:${session.sessionId}`), JSON.stringify(record));

  store.clearSession(session.sessionId);
  assert.equal(store.loadSession(session.sessionId), null);
  assert.deepEqual(store.listSessions(), []);
});

function createFakeStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
