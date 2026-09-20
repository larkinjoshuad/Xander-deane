import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createInitialLearningSession,
  checkWorkspaceAnswer,
  requestHint,
  placeSelectedCounter,
  selectCounter,
} from '../src/app/learning-session.js';
import {
  createBrowserSessionStore,
  createInMemorySessionStore,
  createSessionRecord,
  rehydrateLearningSession,
  BROWSER_SESSION_LIMITS,
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

test('blocked reads, writes, indexes and removal keep a usable in-memory session', () => {
  for (const failingMethod of ['getItem', 'setItem', 'removeItem']) {
    const storage = createFakeStorage();
    const store = createBrowserSessionStore({ storage, now: fixedNow });
    const session = createMathSession();
    if (failingMethod === 'removeItem') store.saveSession(session);
    storage[failingMethod] = () => { throw new DOMException('Denied', 'SecurityError'); };
    const saved = store.saveSession(session);
    assert.deepEqual(store.loadSession(session.sessionId), saved);
    assert.equal(store.listSessions().length, 1);
    if (failingMethod === 'removeItem') assert.equal(store.clearSession(session.sessionId), false);
    assert.equal(store.persistent, false);
    if (failingMethod === 'removeItem') assert.equal(store.loadSession(session.sessionId), null);
  }
  const storage = createFakeStorage();
  const original = storage.setItem;
  storage.setItem = (key, value) => {
    if (key.endsWith(':index')) throw new DOMException('Full', 'QuotaExceededError');
    original(key, value);
  };
  const store = createBrowserSessionStore({ storage, now: fixedNow });
  const record = store.saveSession(createMathSession());
  assert.equal(store.persistent, false);
  assert.equal(store.listSessions()[0].id, record.id);
});

test('storage property denial and absent storage do not prevent creating a store', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Blocked'); } });
    const store = createBrowserSessionStore();
    store.saveSession(createMathSession());
    assert.equal(store.persistent, false);
    assert.equal(store.listSessions().length, 1);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('corrupt, oversized, old-version and cross-session records recover without deleting unrelated data', () => {
  const session = createMathSession();
  const record = createSessionRecord(session, { now: fixedNow });
  const badRecords = ['{', 'null', '[]', 'x'.repeat(BROWSER_SESSION_LIMITS.characters + 1),
    JSON.stringify({ ...record, contractVersion: 'future' }),
    JSON.stringify({ ...record, sessionId: 'someone_else' }),
    JSON.stringify({ ...record, events: [null] }),
    JSON.stringify({ ...record, currentWorkspaceSnapshot: { ...record.currentWorkspaceSnapshot, state: null } })];
  for (const raw of badRecords) {
    const storage = createFakeStorage();
    storage.setItem('test.learning:record:' + session.sessionId, raw);
    storage.setItem('unrelated', 'keep');
    const store = createBrowserSessionStore({ namespace: 'test.learning', storage, now: fixedNow });
    assert.equal(store.loadSession(session.sessionId), null);
    assert.equal(store.recovered, true);
    store.saveSession(session);
    assert.equal(store.loadSession(session.sessionId).sessionId, session.sessionId);
    assert.equal(storage.getItem('unrelated'), 'keep');
  }
});

test('malformed indexes are recoverable and clearing is scoped to one session', () => {
  for (const raw of ['{', '{}', '[null]', JSON.stringify(Array(51).fill('id'))]) {
    const storage = createFakeStorage();
    storage.setItem('test.learning:index', raw);
    storage.setItem('unrelated', 'keep');
    const store = createBrowserSessionStore({ namespace: 'test.learning', storage, now: fixedNow });
    assert.deepEqual(store.listSessions(), []);
    assert.equal(store.recovered, true);
    store.saveSession(createMathSession());
    store.saveSession({ ...createMathSession(), sessionId: 'another' });
    assert.equal(store.clearSession(createMathSession().sessionId), true);
    assert.equal(store.listSessions().length, 1);
    assert.equal(storage.getItem('unrelated'), 'keep');
  }
});

test('an unreadable index is not overwritten during save or deletion', () => {
  const storage = createFakeStorage();
  const first = createBrowserSessionStore({ storage, now: fixedNow });
  const session = createMathSession();
  first.saveSession(session);
  const original = storage.getItem;
  const indexKey = 'xander-deane.learning-session:index';
  const index = original(indexKey);
  storage.getItem = key => {
    if (key === indexKey) throw new Error('Storage unavailable');
    return original(key);
  };
  const failing = createBrowserSessionStore({ storage, now: fixedNow });
  failing.saveSession(session);
  assert.equal(failing.clearSession(session.sessionId), false);
  assert.equal(original(indexKey), index);
  assert.equal(failing.persistent, false);
});

test('rehydration rejects inconsistent placements and changed lesson content', () => {
  const session = createMathSession();
  const record = structuredClone(createSessionRecord(session, { now: fixedNow }));
  record.currentWorkspaceSnapshot.state.groups[0].items.push('counter_1');
  assert.throws(() => rehydrateLearningSession(session, record), /damaged|incompatible/);
  const changed = structuredClone(createSessionRecord(session, { now: fixedNow }));
  changed.currentWorkspaceSnapshot.state.counters.pop();
  assert.throws(() => rehydrateLearningSession(session, changed), /damaged|incompatible/);
});

test('browser saves bind the lesson definition and reject unversioned legacy records', () => {
  const storage = createFakeStorage();
  const store = createBrowserSessionStore({ storage, now: fixedNow });
  const session = createMathSession();
  const record = store.saveSession(session);
  const changed = { ...session, problem: { ...session.problem, prompt: 'A changed prompt' } };
  assert.throws(() => rehydrateLearningSession(changed, record), /incompatible/);
  const replacement = store.saveSession(changed);
  assert.equal(replacement.metadata.contentKey, JSON.stringify(changed.problem));
  assert.equal(replacement.snapshotHistory.length, 1);
  storage.setItem('xander-deane.learning-session:record:' + session.sessionId, JSON.stringify(createSessionRecord(session, { now: fixedNow })));
  const legacy = createBrowserSessionStore({ storage, now: fixedNow });
  assert.equal(legacy.loadSession(session.sessionId), null);
  assert.equal(legacy.recovered, true);
});

test('browser histories stay bounded and event IDs remain unique after compaction and reload', () => {
  const storage = createFakeStorage();
  const store = createBrowserSessionStore({ storage, now: fixedNow });
  let session = createMathSession();
  session = requestHint(session, fixedNow);
  store.saveSession(session);
  let record;
  for (let i = 0; i < 240; i++) {
    session = selectCounter(session, 'counter_1');
    session = placeSelectedCounter(session, i % 2 ? 'group_1' : 'group_2', fixedNow);
    record = store.saveSession(session);
    session = rehydrateLearningSession(createMathSession(), record);
  }
  assert.equal(record.events.length, BROWSER_SESSION_LIMITS.events);
  assert.equal(record.snapshotHistory.length, BROWSER_SESSION_LIMITS.snapshots);
  assert.equal(record.metadata.historyTruncated, true);
  assert.equal(new Set(record.events.map(event => event.id)).size, record.events.length);
  const reloaded = createBrowserSessionStore({ storage, now: fixedNow }).loadSession(session.sessionId);
  session = checkWorkspaceAnswer(rehydrateLearningSession(createMathSession(), reloaded), fixedNow);
  assert.ok(session.events.at(-1).id.endsWith('_243'));
  assert.equal(record.metadata.totalHintCount, 1);
  assert.deepEqual(validateJsonSchema(store.saveSession(session), sessionRecordSchema), []);
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
