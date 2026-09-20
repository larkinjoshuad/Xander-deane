import { CONTRACT_VERSION } from '../core/domain.js';

const DEFAULT_NAMESPACE = 'xander-deane.learning-session';
export const BROWSER_SESSION_LIMITS = Object.freeze({ events: 200, snapshots: 40, sessions: 50, characters: 500000 });

export function createSessionRecord(session, {
  previousRecord = null,
  now = () => new Date().toISOString(),
  limits = null,
} = {}) {
  const previousEvents = previousRecord?.events ?? [];
  const previousSnapshotHistory = previousRecord?.snapshotHistory ?? [];
  const currentWorkspaceSnapshot = cloneJson(session.workspaceSnapshot);
  let snapshotHistory = shouldAppendSnapshot(previousSnapshotHistory, currentWorkspaceSnapshot)
    ? [...previousSnapshotHistory, currentWorkspaceSnapshot]
    : previousSnapshotHistory;
  let events = mergeEvents(previousEvents, session.events);
  const previousIds = new Set(previousEvents.map(event => event.id));
  const hintCount = (previousRecord?.metadata?.totalHintCount ?? previousEvents.filter(event => event.type === 'hint_requested').length)
    + session.events.filter(event => event.type === 'hint_requested' && !previousIds.has(event.id)).length;
  const truncated = previousRecord?.metadata?.historyTruncated === true || (limits
    && (events.length > limits.events || snapshotHistory.length > limits.snapshots));
  if (limits) {
    events = events.slice(-limits.events);
    snapshotHistory = snapshotHistory.slice(-limits.snapshots);
  }

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
    events,
    tutorResponse: session.tutorResponse,
    evaluation: session.evaluation,
    updatedAt: now(),
    metadata: {
      source: 'session-persistence',
      eventCount: events.length,
      snapshotCount: snapshotHistory.length,
      ...(truncated ? { historyTruncated: true } : {}),
      ...(limits ? { totalHintCount: hintCount, storageVersion: 1, contentKey: JSON.stringify(session.problem) } : {}),
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
  const memory = new Map();
  let persistent = Boolean(storage);
  let recovered = false;
  let indexReadable = true;
  const remember = (id, record) => {
    memory.delete(id);
    memory.set(id, record);
    if (memory.size > BROWSER_SESSION_LIMITS.sessions) memory.delete(memory.keys().next().value);
  };
  const readIndex = () => {
    let raw;
    try { raw = storage?.getItem(indexKey(namespace)); }
    catch { persistent = false; indexReadable = false; return []; }
    indexReadable = true;
    try {
      if (!raw) return [];
      if (raw.length > 20000) throw new TypeError('Oversized session index');
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids) || ids.length > BROWSER_SESSION_LIMITS.sessions || !ids.every(validId)) {
        throw new TypeError('Invalid session index');
      }
      return [...new Set(ids)];
    } catch {
      recovered = true;
      return [];
    }
  };

  return Object.freeze({
    get persistent() { return persistent; },
    get recovered() { return recovered; },
    saveSession(session) {
      const loaded = this.loadSession(session.sessionId);
      const previousRecord = loaded?.metadata?.contentKey === JSON.stringify(session.problem) ? loaded : null;
      const record = createSessionRecord(session, { previousRecord, now, limits: BROWSER_SESSION_LIMITS });
      remember(session.sessionId, record);
      try {
        const raw = JSON.stringify(record);
        if (raw.length > BROWSER_SESSION_LIMITS.characters) throw new RangeError('Session too large');
        const ids = readIndex().filter(id => id !== session.sessionId);
        if (!indexReadable) throw new Error('Cannot safely update an unreadable index');
        if (ids.length >= BROWSER_SESSION_LIMITS.sessions) throw new RangeError('Session storage is full');
        storage?.setItem(recordKey(namespace, session.sessionId), raw);
        storage?.setItem(indexKey(namespace), JSON.stringify([...ids, session.sessionId]));
      } catch { persistent = false; }
      return record;
    },
    loadSession(sessionId) {
      if (!validId(sessionId)) return null;
      if (memory.has(sessionId)) return memory.get(sessionId);
      let record = null;
      try {
        const raw = storage?.getItem(recordKey(namespace, sessionId));
        if (raw) {
          try {
            if (raw.length > BROWSER_SESSION_LIMITS.characters) throw new TypeError('Oversized save');
            const parsed = JSON.parse(raw);
            if (!validStoredRecord(parsed, sessionId) || parsed.metadata?.storageVersion !== 1
                || typeof parsed.metadata?.contentKey !== 'string') throw new TypeError('Invalid or unversioned save');
            record = freezeJson(parsed);
          } catch { recovered = true; }
        }
      } catch { persistent = false; }
      remember(sessionId, record);
      return record;
    },
    listSessions() {
      const ids = [...new Set([...readIndex(), ...memory.keys()])];
      return Object.freeze(ids.map(id => this.loadSession(id)).filter(Boolean));
    },
    clearSession(sessionId) {
      if (!validId(sessionId)) return false;
      remember(sessionId, null);
      try {
        const ids = readIndex();
        if (!indexReadable) throw new Error('Cannot safely update an unreadable index');
        storage?.removeItem(recordKey(namespace, sessionId));
        storage?.setItem(indexKey(namespace), JSON.stringify(ids.filter(id => id !== sessionId)));
        return Boolean(storage);
      } catch { persistent = false; return false; }
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
  if (!validStoredRecord(sessionRecord, session.sessionId)
      || (sessionRecord.metadata?.contentKey !== undefined && sessionRecord.metadata.contentKey !== JSON.stringify(session.problem))
      || !workspaceMatchesContent(sessionRecord.currentWorkspaceSnapshot, session.workspaceSnapshot)) {
    throw new RangeError('sessionRecord is damaged or belongs to an incompatible content version');
  }
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function validStoredRecord(record, sessionId) {
  if (!isObject(record) || record.contractVersion !== CONTRACT_VERSION || record.sessionId !== sessionId
      || !validId(record.problemId) || !validDate(record.updatedAt) || !isObject(record.tutorResponse)
      || typeof record.tutorResponse.messageText !== 'string'
      || !Array.isArray(record.events) || !Array.isArray(record.snapshotHistory)) return false;
  if (record.evaluation !== null && (!isObject(record.evaluation) || typeof record.evaluation.isCorrect !== 'boolean')) return false;
  if (record.metadata?.totalHintCount !== undefined
      && (!Number.isSafeInteger(record.metadata.totalHintCount) || record.metadata.totalHintCount < 0)) return false;
  const snapshot = record.currentWorkspaceSnapshot;
  if (!isObject(snapshot) || snapshot.contractVersion !== CONTRACT_VERSION || snapshot.sessionId !== sessionId
      || snapshot.problemId !== record.problemId || snapshot.kind !== record.workspaceKind
      || !Number.isSafeInteger(snapshot.version) || snapshot.version < 1 || !isObject(snapshot.state)) return false;
  return record.events.every(event => isObject(event) && validId(event.id) && typeof event.type === 'string'
    && event.sessionId === sessionId && event.problemId === record.problemId && isObject(event.payload))
    && record.snapshotHistory.every(value => isObject(value) && value.sessionId === sessionId && isObject(value.state));
}

function workspaceMatchesContent(snapshot, initial) {
  const state = snapshot.state, expected = initial.state;
  if (snapshot.kind === 'token-selection') {
    return same(state.tokens, expected.tokens) && same(state.selectableTokenIndexes, expected.selectableTokenIndexes)
      && (state.selectedTokenIndex === null || expected.selectableTokenIndexes.includes(state.selectedTokenIndex));
  }
  const field = snapshot.kind === 'equal-groups' ? 'counters' : snapshot.kind === 'classification-sort' ? 'items' : null;
  if (!field || !Array.isArray(state[field]) || !Array.isArray(state.groups)) return false;
  if (!state[field].every(isObject) || !state.groups.every(group => isObject(group) && Array.isArray(group.items))) return false;
  if (!same(state[field].map(item => item.id), expected[field].map(item => item.id))
      || !same(state.groups.map(group => group.id), expected.groups.map(group => group.id))) return false;
  const assigned = state.groups.flatMap(group => group.items);
  if (new Set(assigned).size !== assigned.length || assigned.some(id => !state[field].some(item => item.id === id))) return false;
  if (!state[field].every(item => item.groupId === null ? !assigned.includes(item.id)
    : state.groups.some(group => group.id === item.groupId && group.items.includes(item.id)))) return false;
  return field !== 'items' || state.selectedItemId === null || state.items.some(item => item.id === state.selectedItemId);
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

function recordKey(namespace, sessionId) {
  return `${namespace}:record:${sessionId}`;
}

function indexKey(namespace) {
  return `${namespace}:index`;
}

function getBrowserStorage() {
  try { return globalThis.window?.localStorage ?? globalThis.localStorage ?? null; } catch { return null; }
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
