export async function runSessionRecoveryDrill({
  sourceService,
  restoredService,
  checkedAt = new Date().toISOString(),
  scope = 'session_store_backup_restore',
} = {}) {
  assertSessionService(sourceService, 'sourceService');
  assertSessionService(restoredService, 'restoredService');
  assertDateTime(checkedAt, 'checkedAt');
  assertNonEmptyString(scope, 'scope');

  const [sourceRecords, restoredRecords, sourceTombstones, restoredTombstones] = await Promise.all([
    sourceService.listSessionRecords(),
    restoredService.listSessionRecords(),
    listTombstones(sourceService),
    listTombstones(restoredService),
  ]);

  return createSessionRecoveryDrillReport({
    sourceRecords,
    restoredRecords,
    sourceTombstones,
    restoredTombstones,
    checkedAt,
    scope,
  });
}

export function createSessionRecoveryDrillReport({
  sourceRecords = [],
  restoredRecords = [],
  sourceTombstones = [],
  restoredTombstones = [],
  checkedAt = new Date().toISOString(),
  scope = 'session_store_backup_restore',
} = {}) {
  assertArray(sourceRecords, 'sourceRecords');
  assertArray(restoredRecords, 'restoredRecords');
  assertArray(sourceTombstones, 'sourceTombstones');
  assertArray(restoredTombstones, 'restoredTombstones');
  assertDateTime(checkedAt, 'checkedAt');
  assertNonEmptyString(scope, 'scope');

  const sourceRecordMap = indexBySessionId(sourceRecords, 'sourceRecords');
  const restoredRecordMap = indexBySessionId(restoredRecords, 'restoredRecords');
  const sourceTombstoneMap = indexBySessionId(sourceTombstones, 'sourceTombstones');
  const restoredTombstoneMap = indexBySessionId(restoredTombstones, 'restoredTombstones');
  const activeSessions = compareActiveRecords(sourceRecordMap, restoredRecordMap);
  const tombstones = compareTombstones(sourceTombstoneMap, restoredTombstoneMap);
  const mismatches = Object.freeze([
    ...activeSessions.filter((entry) => entry.status !== 'matched').map((entry) => ({
      type: 'active_session',
      sessionId: entry.sessionId,
      status: entry.status,
      reason: entry.reason,
    })),
    ...tombstones.filter((entry) => entry.status !== 'matched').map((entry) => ({
      type: 'deleted_session_tombstone',
      sessionId: entry.sessionId,
      status: entry.status,
      reason: entry.reason,
    })),
  ].map(freezeJson));

  return freezeJson({
    checkedAt,
    scope,
    status: mismatches.length === 0 ? 'passed' : 'failed',
    counts: {
      sourceActiveRecords: sourceRecords.length,
      restoredActiveRecords: restoredRecords.length,
      sourceTombstones: sourceTombstones.length,
      restoredTombstones: restoredTombstones.length,
      mismatches: mismatches.length,
    },
    activeSessions,
    tombstones,
    mismatches,
  });
}

async function listTombstones(service) {
  if (typeof service.listDeletedSessionTombstones !== 'function') {
    return [];
  }
  return service.listDeletedSessionTombstones();
}

function compareActiveRecords(sourceMap, restoredMap) {
  return Object.freeze([...unionKeys(sourceMap, restoredMap)].sort().map((sessionId) => {
    const source = sourceMap.get(sessionId);
    const restored = restoredMap.get(sessionId);
    if (!source) {
      return freezeJson({
        sessionId,
        status: 'unexpected_restored',
        reason: 'restored service has an active record absent from the source service',
        sourceRecordVersion: null,
        restoredRecordVersion: restored.metadata?.recordVersion ?? null,
        sourceEtag: null,
        restoredEtag: restored.metadata?.etag ?? null,
      });
    }
    if (!restored) {
      return freezeJson({
        sessionId,
        status: 'missing_restored',
        reason: 'source active record is missing from the restored service',
        sourceRecordVersion: source.metadata?.recordVersion ?? null,
        restoredRecordVersion: null,
        sourceEtag: source.metadata?.etag ?? null,
        restoredEtag: null,
      });
    }

    const sourceRecordVersion = source.metadata?.recordVersion ?? null;
    const restoredRecordVersion = restored.metadata?.recordVersion ?? null;
    const sourceEtag = source.metadata?.etag ?? null;
    const restoredEtag = restored.metadata?.etag ?? null;
    const matched = sourceRecordVersion === restoredRecordVersion && sourceEtag === restoredEtag;
    return freezeJson({
      sessionId,
      status: matched ? 'matched' : 'metadata_mismatch',
      reason: matched ? 'active record version and ETag match' : 'active record version or ETag differs after restore',
      sourceRecordVersion,
      restoredRecordVersion,
      sourceEtag,
      restoredEtag,
    });
  }));
}

function compareTombstones(sourceMap, restoredMap) {
  return Object.freeze([...unionKeys(sourceMap, restoredMap)].sort().map((sessionId) => {
    const source = sourceMap.get(sessionId);
    const restored = restoredMap.get(sessionId);
    if (!source) {
      return freezeJson({
        sessionId,
        status: 'unexpected_restored',
        reason: 'restored service has a tombstone absent from the source service',
        sourceTombstoneId: null,
        restoredTombstoneId: restored.tombstoneId ?? null,
      });
    }
    if (!restored) {
      return freezeJson({
        sessionId,
        status: 'missing_restored',
        reason: 'source tombstone is missing from the restored service',
        sourceTombstoneId: source.tombstoneId ?? null,
        restoredTombstoneId: null,
      });
    }

    const sourceTombstoneId = source.tombstoneId ?? null;
    const restoredTombstoneId = restored.tombstoneId ?? null;
    const matched = sourceTombstoneId === restoredTombstoneId && source.deletedAt === restored.deletedAt;
    return freezeJson({
      sessionId,
      status: matched ? 'matched' : 'metadata_mismatch',
      reason: matched ? 'tombstone ID and deletion time match' : 'tombstone ID or deletion time differs after restore',
      sourceTombstoneId,
      restoredTombstoneId,
    });
  }));
}

function indexBySessionId(values, fieldName) {
  const map = new Map();
  values.forEach((value, index) => {
    assertPlainObject(value, `${fieldName}[${index}]`);
    assertNonEmptyString(value.sessionId, `${fieldName}[${index}].sessionId`);
    map.set(value.sessionId, value);
  });
  return map;
}

function unionKeys(left, right) {
  return new Set([...left.keys(), ...right.keys()]);
}

function assertSessionService(value, fieldName) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`${fieldName} must be an object`);
  }
  if (typeof value.listSessionRecords !== 'function') {
    throw new TypeError(`${fieldName}.listSessionRecords must be a function`);
  }
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array`);
  }
}

function assertDateTime(value, fieldName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${fieldName} must be a valid date-time`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function freezeJson(value) {
  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
