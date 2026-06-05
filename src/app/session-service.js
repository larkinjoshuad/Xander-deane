import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createSessionRecord } from './session-persistence.js';
import { assertConsentAllows, summarizeConsentSafety } from './consent-safety.js';

export class SessionRecordVersionConflictError extends RangeError {
  constructor(message) {
    super(message);
    this.name = 'SessionRecordVersionConflictError';
  }
}

export function createSessionPersistenceService({
  recordStore = createInMemorySessionRecordStore(),
  now = () => new Date().toISOString(),
  consentRecord = null,
  safetyPolicy = null,
  requiredConsentScopes = [],
} = {}) {
  assertConsentScopes(requiredConsentScopes, 'requiredConsentScopes');
  return Object.freeze({
    async saveSession(session, options = {}) {
      const operationConsentRecord = options.consentRecord ?? consentRecord;
      const operationSafetyPolicy = options.safetyPolicy ?? safetyPolicy;
      const previousRecord = await recordStore.loadRecord(session.sessionId);
      assertExpectedRecordVersion(previousRecord, options.expectedRecordVersion, session.sessionId);
      const record = createSessionRecord(session, { previousRecord, now });
      const normalizedRecord = normalizeRecord(record, {
        now,
        consentRecord: operationConsentRecord,
        safetyPolicy: operationSafetyPolicy,
        requiredConsentScopes,
        previousRecord,
      });
      await recordStore.saveRecord(normalizedRecord);
      return freezeJson(normalizedRecord);
    },
    async saveSessionRecord(record, options = {}) {
      const previousRecord = await recordStore.loadRecord(record.sessionId);
      assertExpectedRecordVersion(previousRecord, options.expectedRecordVersion, record.sessionId);
      const normalizedRecord = normalizeRecord(record, {
        now,
        consentRecord: options.consentRecord ?? consentRecord,
        safetyPolicy: options.safetyPolicy ?? safetyPolicy,
        requiredConsentScopes,
        previousRecord,
      });
      await recordStore.saveRecord(normalizedRecord);
      return normalizedRecord;
    },
    async loadSessionRecord(sessionId) {
      const record = await recordStore.loadRecord(sessionId);
      return record ? freezeJson(record) : null;
    },
    async listSessionRecords(filter = {}) {
      const records = await recordStore.listRecords();
      return Object.freeze(records.filter((record) => matchesFilter(record, filter)).map((record) => freezeJson(record)));
    },
    async loadDeletedSessionTombstone(sessionId) {
      assertNonEmptyString(sessionId, 'sessionId');
      if (typeof recordStore.loadTombstone !== 'function') return null;
      const tombstone = await recordStore.loadTombstone(sessionId);
      return tombstone ? freezeJson(tombstone) : null;
    },
    async listDeletedSessionTombstones(filter = {}) {
      if (typeof recordStore.listTombstones !== 'function') return Object.freeze([]);
      const tombstones = await recordStore.listTombstones();
      return Object.freeze(tombstones.filter((tombstone) => matchesTombstoneFilter(tombstone, filter)).map((tombstone) => freezeJson(tombstone)));
    },
    async deleteSessionRecord(sessionId, options = {}) {
      const previousRecord = await recordStore.loadRecord(sessionId);
      assertExpectedRecordVersion(previousRecord, options.expectedRecordVersion, sessionId);
      await recordStore.deleteRecord(sessionId, {
        tombstone: options.tombstone,
        deletedRecord: previousRecord,
      });
    },
    async appendInteractionEvent(sessionId, event, options = {}) {
      const operationConsentRecord = options.consentRecord ?? consentRecord;
      const operationSafetyPolicy = options.safetyPolicy ?? safetyPolicy;
      const record = await requireRecord(recordStore, sessionId);
      assertExpectedRecordVersion(record, options.expectedRecordVersion, sessionId);
      const existingIds = new Set(record.events.map((existingEvent) => existingEvent.id));
      const events = existingIds.has(event.id) ? record.events : [...record.events, cloneJson(event)];
      const updatedRecord = normalizeRecord({
        ...record,
        events,
      }, {
        now,
        consentRecord: operationConsentRecord,
        safetyPolicy: operationSafetyPolicy,
        requiredConsentScopes,
        previousRecord: record,
      });
      await recordStore.saveRecord(updatedRecord);
      return updatedRecord;
    },
    async appendWorkspaceSnapshot(sessionId, workspaceSnapshot, options = {}) {
      const operationConsentRecord = options.consentRecord ?? consentRecord;
      const operationSafetyPolicy = options.safetyPolicy ?? safetyPolicy;
      const record = await requireRecord(recordStore, sessionId);
      assertExpectedRecordVersion(record, options.expectedRecordVersion, sessionId);
      const currentWorkspaceSnapshot = cloneJson(workspaceSnapshot);
      const previousSnapshot = record.snapshotHistory.at(-1);
      const snapshotHistory = previousSnapshot && JSON.stringify(previousSnapshot) === JSON.stringify(currentWorkspaceSnapshot)
        ? record.snapshotHistory
        : [...record.snapshotHistory, currentWorkspaceSnapshot];
      const updatedRecord = normalizeRecord({
        ...record,
        currentWorkspaceSnapshot,
        snapshotHistory,
      }, {
        now,
        consentRecord: operationConsentRecord,
        safetyPolicy: operationSafetyPolicy,
        requiredConsentScopes,
        previousRecord: record,
      });
      await recordStore.saveRecord(updatedRecord);
      return updatedRecord;
    },
  });
}

export function createInMemorySessionRecordStore(initialRecords = []) {
  const records = new Map(initialRecords.map((record) => [record.sessionId, freezeJson(record)]));
  const tombstones = new Map();

  return Object.freeze({
    async saveRecord(record) {
      const normalizedRecord = freezeJson(record);
      records.set(normalizedRecord.sessionId, normalizedRecord);
      tombstones.delete(normalizedRecord.sessionId);
    },
    async loadRecord(sessionId) {
      const record = records.get(sessionId);
      return record ? freezeJson(record) : null;
    },
    async listRecords() {
      return Object.freeze([...records.values()].map((record) => freezeJson(record)));
    },
    async deleteRecord(sessionId, options = {}) {
      if (options.tombstone) {
        tombstones.set(sessionId, freezeJson(options.tombstone));
      }
      records.delete(sessionId);
    },
    async loadTombstone(sessionId) {
      const tombstone = tombstones.get(sessionId);
      return tombstone ? freezeJson(tombstone) : null;
    },
    async listTombstones() {
      return Object.freeze([...tombstones.values()].map((tombstone) => freezeJson(tombstone)));
    },
  });
}

export function createFileSessionRecordStore({ directory }) {
  if (!directory) {
    throw new TypeError('directory is required for createFileSessionRecordStore');
  }

  return Object.freeze({
    async saveRecord(record) {
      await mkdir(directory, { recursive: true });
      await writeFile(recordPath(directory, record.sessionId), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
      await rm(tombstonePath(directory, record.sessionId), { force: true });
    },
    async loadRecord(sessionId) {
      const path = recordPath(directory, sessionId);
      const rawRecord = await readFile(path, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      return rawRecord ? freezeJson(JSON.parse(rawRecord)) : null;
    },
    async listRecords() {
      const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      const records = await Promise.all(entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.session-record.json'))
        .map((entry) => readFile(join(directory, entry.name), 'utf8').then((rawRecord) => JSON.parse(rawRecord))));
      return Object.freeze(records.map((record) => freezeJson(record)));
    },
    async deleteRecord(sessionId, options = {}) {
      await mkdir(directory, { recursive: true });
      if (options.tombstone) {
        await writeFile(tombstonePath(directory, sessionId), `${JSON.stringify(options.tombstone, null, 2)}\n`, 'utf8');
      }
      await rm(recordPath(directory, sessionId), { force: true });
    },
    async loadTombstone(sessionId) {
      const rawTombstone = await readFile(tombstonePath(directory, sessionId), 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      return rawTombstone ? freezeJson(JSON.parse(rawTombstone)) : null;
    },
    async listTombstones() {
      const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      const tombstones = await Promise.all(entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.session-tombstone.json'))
        .map((entry) => readFile(join(directory, entry.name), 'utf8').then((rawTombstone) => JSON.parse(rawTombstone))));
      return Object.freeze(tombstones.map((tombstone) => freezeJson(tombstone)));
    },
  });
}

export function createAppendOnlyFileSessionRecordStore({ directory, fileName = 'session-record-events.jsonl' }) {
  if (!directory) {
    throw new TypeError('directory is required for createAppendOnlyFileSessionRecordStore');
  }
  assertNonEmptyString(fileName, 'fileName');
  const logPath = join(directory, safeFileName(fileName));

  return Object.freeze({
    async saveRecord(record) {
      const frozenRecord = freezeJson(record);
      await appendRecordStoreEvent(logPath, {
        type: 'upsert',
        sessionId: frozenRecord.sessionId,
        record: frozenRecord,
      });
    },
    async loadRecord(sessionId) {
      const records = await materializeAppendOnlyRecords(logPath);
      const record = records.get(sessionId);
      return record ? freezeJson(record) : null;
    },
    async listRecords() {
      const records = await materializeAppendOnlyRecords(logPath);
      return Object.freeze([...records.values()].map((record) => freezeJson(record)));
    },
    async deleteRecord(sessionId, options = {}) {
      await appendRecordStoreEvent(logPath, {
        type: 'delete',
        sessionId,
        ...(options.tombstone ? { tombstone: freezeJson(options.tombstone) } : {}),
      });
    },
    async loadTombstone(sessionId) {
      const { tombstones } = await materializeAppendOnlyState(logPath);
      const tombstone = tombstones.get(sessionId);
      return tombstone ? freezeJson(tombstone) : null;
    },
    async listTombstones() {
      const { tombstones } = await materializeAppendOnlyState(logPath);
      return Object.freeze([...tombstones.values()].map((tombstone) => freezeJson(tombstone)));
    },
  });
}

async function appendRecordStoreEvent(logPath, event) {
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf8');
}

async function materializeAppendOnlyRecords(logPath) {
  const { records } = await materializeAppendOnlyState(logPath);
  return records;
}

async function materializeAppendOnlyState(logPath) {
  const rawLog = await readFile(logPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const records = new Map();
  const tombstones = new Map();
  rawLog
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .forEach((line, index) => {
      const event = JSON.parse(line);
      assertAppendOnlyRecordEvent(event, index + 1);
      if (event.type === 'delete') {
        records.delete(event.sessionId);
        if (event.tombstone) {
          tombstones.set(event.sessionId, freezeJson(event.tombstone));
        }
        return;
      }
      records.set(event.sessionId, freezeJson(event.record));
      tombstones.delete(event.sessionId);
    });
  return { records, tombstones };
}

function assertAppendOnlyRecordEvent(event, lineNumber) {
  assertPlainObject(event, `append-only record event at line ${lineNumber}`);
  if (!['upsert', 'delete'].includes(event.type)) {
    throw new TypeError(`append-only record event at line ${lineNumber}.type must be upsert or delete`);
  }
  assertNonEmptyString(event.sessionId, `append-only record event at line ${lineNumber}.sessionId`);
  if (event.type === 'upsert') {
    assertPlainObject(event.record, `append-only record event at line ${lineNumber}.record`);
    if (event.record.sessionId !== event.sessionId) {
      throw new TypeError(`append-only record event at line ${lineNumber}.record.sessionId must match event.sessionId`);
    }
  }
  if (event.type === 'delete' && event.tombstone !== undefined) {
    assertPlainObject(event.tombstone, `append-only record event at line ${lineNumber}.tombstone`);
    if (event.tombstone.sessionId !== event.sessionId) {
      throw new TypeError(`append-only record event at line ${lineNumber}.tombstone.sessionId must match event.sessionId`);
    }
  }
}

async function requireRecord(recordStore, sessionId) {
  const record = await recordStore.loadRecord(sessionId);
  if (!record) {
    throw new RangeError(`session record ${sessionId} was not found`);
  }
  return record;
}

function normalizeRecord(record, { now, consentRecord, safetyPolicy, requiredConsentScopes, previousRecord = null }) {
  const updatedAt = now();
  enforceConsent(requiredConsentScopes, consentRecord, updatedAt, record.learnerId);
  const consentSafetySummary = consentRecord || safetyPolicy
    ? summarizeConsentSafety({ consentRecord, safetyPolicy, at: updatedAt })
    : undefined;
  const recordVersion = nextRecordVersion(previousRecord);
  const normalizedRecord = {
    ...cloneJson(record),
    updatedAt,
    metadata: {
      ...(record.metadata ?? {}),
      source: record.metadata?.source ?? 'session-service',
      eventCount: record.events.length,
      snapshotCount: record.snapshotHistory.length,
      recordVersion,
      etag: createRecordEtag(record.sessionId, recordVersion),
      ...(consentSafetySummary ? { consentSafetySummary } : {}),
    },
  };
  return freezeJson(normalizedRecord);
}


function assertExpectedRecordVersion(record, expectedRecordVersion, sessionId) {
  if (expectedRecordVersion === undefined || expectedRecordVersion === null) return;
  assertRecordVersion(expectedRecordVersion, 'expectedRecordVersion');
  if (!record) {
    throw new SessionRecordVersionConflictError(`session record ${sessionId} has no version because it does not exist; expected version ${expectedRecordVersion}`);
  }
  const currentVersion = getRecordVersion(record);
  if (currentVersion !== expectedRecordVersion) {
    throw new SessionRecordVersionConflictError(`session record ${sessionId} version conflict: expected ${expectedRecordVersion}, current ${currentVersion}`);
  }
}

function nextRecordVersion(previousRecord) {
  return previousRecord ? getRecordVersion(previousRecord) + 1 : 1;
}

function getRecordVersion(record) {
  const version = record?.metadata?.recordVersion ?? 0;
  assertRecordVersion(version, 'record.metadata.recordVersion');
  return version;
}

function createRecordEtag(sessionId, recordVersion) {
  return `W/"${safeFileName(sessionId)}:${recordVersion}"`;
}

function assertRecordVersion(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer`);
  }
}

function enforceConsent(requiredConsentScopes, consentRecord, at, learnerId) {
  if (consentRecord && learnerId !== null && consentRecord.learnerId !== learnerId) {
    throw new RangeError(`consent record learner ${consentRecord.learnerId} does not match session learner ${learnerId}`);
  }
  requiredConsentScopes.forEach((scope) => {
    assertConsentAllows(consentRecord, scope, { at });
  });
}

function assertConsentScopes(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array`);
  }
  value.forEach((scope) => {
    if (typeof scope !== 'string' || scope.trim().length === 0) {
      throw new TypeError(`${fieldName} entries must be non-empty strings`);
    }
  });
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
}

function matchesFilter(record, filter) {
  if (filter.learnerId !== undefined && record.learnerId !== filter.learnerId) return false;
  if (filter.subject !== undefined && record.subject !== filter.subject) return false;
  if (filter.workspaceKind !== undefined && record.workspaceKind !== filter.workspaceKind) return false;
  if (filter.problemId !== undefined && record.problemId !== filter.problemId) return false;
  return true;
}

function matchesTombstoneFilter(tombstone, filter) {
  if (filter.learnerId !== undefined && tombstone.learnerId !== filter.learnerId) return false;
  if (filter.sessionId !== undefined && tombstone.sessionId !== filter.sessionId) return false;
  return true;
}

function recordPath(directory, sessionId) {
  return join(directory, `${safeFileName(sessionId)}.session-record.json`);
}

function tombstonePath(directory, sessionId) {
  return join(directory, `${safeFileName(sessionId)}.session-tombstone.json`);
}

function safeFileName(value) {
  return String(value).replaceAll(/[^a-zA-Z0-9._-]/g, '_');
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
