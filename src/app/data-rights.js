import { CONTRACT_VERSION } from '../core/domain.js';

const SESSION_EXPORT_CONTRACTS = Object.freeze([
  'session-record',
  'interaction-event',
  'workspace-snapshot',
  'evaluation-result',
  'tutor-response',
]);

export function createSessionDataExport({
  sessionRecord,
  inventoryRecords = [],
  exportedAt = new Date().toISOString(),
  exportedByAccountId = null,
  traceId = null,
  retentionDisposition = null,
  contractVersion = CONTRACT_VERSION,
} = {}) {
  assertPlainObject(sessionRecord, 'sessionRecord');
  assertNonEmptyString(sessionRecord.sessionId, 'sessionRecord.sessionId');
  assertOptionalString(sessionRecord.learnerId, 'sessionRecord.learnerId');
  assertArray(inventoryRecords, 'inventoryRecords');
  assertDateTime(exportedAt, 'exportedAt');
  assertOptionalString(exportedByAccountId, 'exportedByAccountId');
  assertOptionalString(traceId, 'traceId');
  assertNonEmptyString(contractVersion, 'contractVersion');
  if (retentionDisposition !== null) {
    assertPlainObject(retentionDisposition, 'retentionDisposition');
  }

  return freezeJson({
    contractVersion,
    exportId: `export_${sanitizeIdPart(sessionRecord.sessionId)}_${sanitizeIdPart(exportedAt)}`,
    exportedAt,
    exportedByAccountId,
    traceId,
    learnerId: sessionRecord.learnerId ?? null,
    sessionId: sessionRecord.sessionId,
    mode: 'session_data_export',
    dataInventory: selectInventoryRecords(inventoryRecords, SESSION_EXPORT_CONTRACTS),
    records: {
      sessionRecord,
    },
    metadata: {
      recordVersion: sessionRecord.metadata?.recordVersion ?? null,
      etag: sessionRecord.metadata?.etag ?? null,
      includes: ['sessionRecord'],
      retentionDisposition,
    },
  });
}

export function selectInventoryRecords(inventoryRecords, contractNames) {
  assertArray(inventoryRecords, 'inventoryRecords');
  assertArray(contractNames, 'contractNames');
  const recordsByName = new Map(inventoryRecords.map((record) => {
    assertPlainObject(record, 'inventoryRecords item');
    assertNonEmptyString(record.contractName, 'inventoryRecords.contractName');
    return [record.contractName, record];
  }));

  return Object.freeze(contractNames
    .filter((contractName) => recordsByName.has(contractName))
    .map((contractName) => freezeJson(recordsByName.get(contractName))));
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

function assertOptionalString(value, fieldName) {
  if (value === null || value === undefined) return;
  assertNonEmptyString(value, fieldName);
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

function sanitizeIdPart(value) {
  return String(value).replaceAll(/[^a-zA-Z0-9._-]/g, '_');
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
