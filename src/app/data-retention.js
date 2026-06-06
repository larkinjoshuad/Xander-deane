const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateRetentionDisposition({
  record,
  retentionPolicy,
  evaluatedAt = new Date().toISOString(),
  consentRecord = null,
} = {}) {
  assertPlainObject(record, 'record');
  assertRetentionPolicy(retentionPolicy, 'retentionPolicy');
  assertDateTime(evaluatedAt, 'evaluatedAt');

  const retainedFrom = record.updatedAt ?? record.metadata?.createdAt ?? record.metadata?.updatedAt;
  assertDateTime(retainedFrom, 'record.updatedAt');
  const expiresAt = addDaysIso(retainedFrom, retentionPolicy.retentionDays);
  const expired = Date.parse(evaluatedAt) >= Date.parse(expiresAt);
  const consentRevokedAt = consentRecord?.revokedAt ?? null;
  const consentRevoked = Boolean(retentionPolicy.deleteOnConsentRevocation && consentRevokedAt);
  const deletionRecommended = expired || consentRevoked;
  const reason = consentRevoked
    ? `consent revoked at ${consentRevokedAt}`
    : expired
      ? `retention expired at ${expiresAt}`
      : `retain until ${expiresAt}`;

  return freezeJson({
    policyId: retentionPolicy.id,
    recordType: retentionPolicy.recordType,
    retainedFrom,
    evaluatedAt,
    expiresAt,
    retentionDays: retentionPolicy.retentionDays,
    expired,
    consentRevoked,
    deleteOnConsentRevocation: retentionPolicy.deleteOnConsentRevocation,
    exportableByGuardian: retentionPolicy.exportableByGuardian,
    requiresAuditTrail: retentionPolicy.requiresAuditTrail,
    status: deletionRecommended ? 'deletion_recommended' : 'active',
    deletionRecommended,
    reason,
  });
}

export function assertExportAllowedByRetention(disposition) {
  assertPlainObject(disposition, 'disposition');
  if (disposition.exportableByGuardian === false) {
    throw new RangeError(`retention policy ${disposition.policyId} does not allow guardian export for ${disposition.recordType}`);
  }
  if (disposition.expired) {
    throw new RangeError(`session record retention expired at ${disposition.expiresAt}; delete or tombstone before export`);
  }
  return true;
}

export function createDeletionTombstone({
  sessionRecord,
  retentionDisposition = null,
  deletedAt = new Date().toISOString(),
  deletedByAccountId = null,
  traceId = null,
  reason = 'guardian deletion request',
} = {}) {
  assertPlainObject(sessionRecord, 'sessionRecord');
  assertNonEmptyString(sessionRecord.sessionId, 'sessionRecord.sessionId');
  assertOptionalString(sessionRecord.learnerId, 'sessionRecord.learnerId');
  assertDateTime(deletedAt, 'deletedAt');
  assertOptionalString(deletedByAccountId, 'deletedByAccountId');
  assertOptionalString(traceId, 'traceId');
  assertNonEmptyString(reason, 'reason');
  if (retentionDisposition !== null) {
    assertPlainObject(retentionDisposition, 'retentionDisposition');
  }

  return freezeJson({
    tombstoneId: `tombstone_${sanitizeIdPart(sessionRecord.sessionId)}_${sanitizeIdPart(deletedAt)}`,
    sessionId: sessionRecord.sessionId,
    learnerId: sessionRecord.learnerId ?? null,
    deletedAt,
    deletedByAccountId,
    traceId,
    reason,
    retentionDisposition,
    metadata: {
      sourceRecordVersion: sessionRecord.metadata?.recordVersion ?? null,
      sourceEtag: sessionRecord.metadata?.etag ?? null,
    },
  });
}

export function resolveRetentionPolicy(policy, recordType = 'session_record') {
  if (policy === null || policy === undefined) return null;
  assertRetentionPolicy(policy, 'retentionPolicy');
  if (policy.recordType !== recordType) {
    throw new TypeError(`retentionPolicy.recordType must be ${recordType}`);
  }
  return policy;
}

function addDaysIso(value, days) {
  const timestamp = Date.parse(value);
  return new Date(timestamp + (days * DAY_MS)).toISOString();
}

function assertRetentionPolicy(value, fieldName) {
  assertPlainObject(value, fieldName);
  assertNonEmptyString(value.id, `${fieldName}.id`);
  assertNonEmptyString(value.recordType, `${fieldName}.recordType`);
  if (!Number.isInteger(value.retentionDays) || value.retentionDays < 0) {
    throw new TypeError(`${fieldName}.retentionDays must be a non-negative integer`);
  }
  if (typeof value.deleteOnConsentRevocation !== 'boolean') {
    throw new TypeError(`${fieldName}.deleteOnConsentRevocation must be a boolean`);
  }
  if (typeof value.exportableByGuardian !== 'boolean') {
    throw new TypeError(`${fieldName}.exportableByGuardian must be a boolean`);
  }
  if (typeof value.requiresAuditTrail !== 'boolean') {
    throw new TypeError(`${fieldName}.requiresAuditTrail must be a boolean`);
  }
  assertDateTime(value.effectiveAt, `${fieldName}.effectiveAt`);
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
