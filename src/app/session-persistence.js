import { CONTRACT_VERSION } from '../core/domain.js';

const DEFAULT_NAMESPACE = 'xander-deane.learning-session';

export function createSessionRecord(session, {
  previousRecord = null,
  now = () => new Date().toISOString(),
} = {}) {
  const previousEvents = previousRecord?.events ?? [];
  const previousSnapshotHistory = previousRecord?.snapshotHistory ?? [];
  const currentWorkspaceSnapshot = cloneJson(session.workspaceSnapshot);
  const snapshotHistory = shouldAppendSnapshot(previousSnapshotHistory, currentWorkspaceSnapshot)
    ? [...previousSnapshotHistory, currentWorkspaceSnapshot]
    : previousSnapshotHistory;

  return freezeJson({
    contractVersion: CONTRACT_VERSION,
    id: `record_${session.sessionId}`,
    sessionId: session.sessionId,
    learnerId: session.learnerId,
    problemId: session.problem.id,
    subject: session.problem.subject,
    workspaceKind: session.workspaceSnapshot.kind,
    currentWorkspaceSnapshot,
    snapshotHistory,
    events: mergeEvents(previousEvents, session.events),
    tutorResponse: session.tutorResponse,
    evaluation: session.evaluation,
    updatedAt: now(),
    metadata: {
      source: 'session-persistence',
      eventCount: mergeEvents(previousEvents, session.events).length,
      snapshotCount: snapshotHistory.length,
    },
  });
}

export function rehydrateLearningSession(session, sessionRecord) {
  assertCompatibleSessionRecord(session, sessionRecord);

  return Object.freeze({
    ...session,
    workspaceSnapshot: freezeJson(sessionRecord.currentWorkspaceSnapshot),
    tutorResponse: freezeJson(sessionRecord.tutorResponse ?? session.tutorResponse),
    evaluation: freezeJson(sessionRecord.evaluation ?? session.evaluation),
    events: Object.freeze(cloneJson(sessionRecord.events ?? session.events)),
  });
}

export function createInMemorySessionStore({ now = () => new Date().toISOString() } = {}) {
  const records = new Map();

  return Object.freeze({
    saveSession(session) {
      const previousRecord = records.get(session.sessionId) ?? null;
      const record = createSessionRecord({ ...session, events: session.events }, { previousRecord, now });
      records.set(session.sessionId, record);
      return record;
    },
    loadSession(sessionId) {
      const record = records.get(sessionId);
      return record ? freezeJson(record) : null;
    },
    listSessions() {
      return Object.freeze([...records.values()].map((record) => freezeJson(record)));
    },
    clearSession(sessionId) {
      records.delete(sessionId);
    },
  });
}

export function createBrowserSessionStore({
  namespace = DEFAULT_NAMESPACE,
  storage = getBrowserStorage(),
  now = () => new Date().toISOString(),
} = {}) {
  if (!storage) {
    return createInMemorySessionStore({ now });
  }

  return Object.freeze({
    saveSession(session) {
      const previousRecord = this.loadSession(session.sessionId);
      const record = createSessionRecord(session, { previousRecord, now });
      storage.setItem(recordKey(namespace, session.sessionId), JSON.stringify(record));
      writeSessionIndex({ namespace, storage, sessionId: session.sessionId });
      return record;
    },
    loadSession(sessionId) {
      const rawRecord = storage.getItem(recordKey(namespace, sessionId));
      return rawRecord ? freezeJson(JSON.parse(rawRecord)) : null;
    },
    listSessions() {
      return Object.freeze(readSessionIndex({ namespace, storage })
        .map((sessionId) => this.loadSession(sessionId))
        .filter(Boolean));
    },
    clearSession(sessionId) {
      storage.removeItem(recordKey(namespace, sessionId));
      const remainingSessionIds = readSessionIndex({ namespace, storage }).filter((id) => id !== sessionId);
      storage.setItem(indexKey(namespace), JSON.stringify(remainingSessionIds));
    },
  });
}

function assertCompatibleSessionRecord(session, sessionRecord) {
  if (!sessionRecord) {
    throw new TypeError('sessionRecord is required to rehydrate a learning session');
  }
  if (session.sessionId !== sessionRecord.sessionId) {
    throw new RangeError(`sessionRecord ${sessionRecord.sessionId} does not match session ${session.sessionId}`);
  }
  if (session.problem.id !== sessionRecord.problemId) {
    throw new RangeError(`sessionRecord problem ${sessionRecord.problemId} does not match ${session.problem.id}`);
  }
  if (session.workspaceSnapshot.kind !== sessionRecord.workspaceKind) {
    throw new RangeError(`sessionRecord workspace ${sessionRecord.workspaceKind} does not match ${session.workspaceSnapshot.kind}`);
  }
}

function mergeEvents(previousEvents, nextEvents) {
  const eventsById = new Map();
  [...previousEvents, ...nextEvents].forEach((event) => {
    if (!eventsById.has(event.id)) {
      eventsById.set(event.id, cloneJson(event));
    }
  });
  return [...eventsById.values()];
}

function shouldAppendSnapshot(snapshotHistory, currentWorkspaceSnapshot) {
  const previousSnapshot = snapshotHistory.at(-1);
  return !previousSnapshot || JSON.stringify(previousSnapshot) !== JSON.stringify(currentWorkspaceSnapshot);
}

function writeSessionIndex({ namespace, storage, sessionId }) {
  const sessionIds = readSessionIndex({ namespace, storage });
  if (!sessionIds.includes(sessionId)) {
    storage.setItem(indexKey(namespace), JSON.stringify([...sessionIds, sessionId].sort()));
  }
}

function readSessionIndex({ namespace, storage }) {
  const rawIndex = storage.getItem(indexKey(namespace));
  if (!rawIndex) return [];
  const parsed = JSON.parse(rawIndex);
  return Array.isArray(parsed) ? parsed.filter((sessionId) => typeof sessionId === 'string') : [];
}

function recordKey(namespace, sessionId) {
  return `${namespace}:record:${sessionId}`;
}

function indexKey(namespace) {
  return `${namespace}:index`;
}

function getBrowserStorage() {
  return globalThis.window?.localStorage ?? globalThis.localStorage ?? null;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function freezeJson(value) {
  return deepFreeze(cloneJson(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
