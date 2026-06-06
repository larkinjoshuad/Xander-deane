import { CONTRACT_VERSION } from '../core/domain.js';

export const AUDIT_ACTIONS = Object.freeze([
  'session.create',
  'session.read',
  'session.list',
  'session.tombstone.read',
  'session.tombstone.list',
  'session.delete',
  'event.append',
  'snapshot.append',
  'consent.grant',
  'consent.revoke',
  'voucher.checkout',
  'voucher.refund',
  'safety.incident.create',
  'learner_link.create',
  'learner_link.update',
  'data.export',
  'data.delete',
  'ai.request',
  'ai.response',
]);

export const AUDIT_RESOURCE_TYPES = Object.freeze([
  'session',
  'session_collection',
  'session_tombstone',
  'session_tombstone_collection',
  'interaction_event',
  'workspace_snapshot',
  'consent_record',
  'voucher_redemption',
  'invoice',
  'ledger_entry',
  'safety_incident',
  'learner_account_link',
  'learner_profile',
  'tutor_context',
  'tutor_response',
]);

export const AUDIT_DECISIONS = Object.freeze(['allowed', 'denied', 'logged', 'escalated']);

export function createAuditEvent({
  id,
  occurredAt = new Date().toISOString(),
  actorAccountId = null,
  learnerId = null,
  action,
  resourceType,
  resourceId,
  permission = null,
  consentScope = null,
  decision = 'logged',
  reason,
  traceId,
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertDateTime(occurredAt, 'occurredAt');
  assertOptionalString(actorAccountId, 'actorAccountId');
  assertOptionalString(learnerId, 'learnerId');
  assertEnum(action, AUDIT_ACTIONS, 'action');
  assertEnum(resourceType, AUDIT_RESOURCE_TYPES, 'resourceType');
  assertNonEmptyString(resourceId, 'resourceId');
  assertOptionalString(permission, 'permission');
  assertOptionalString(consentScope, 'consentScope');
  assertEnum(decision, AUDIT_DECISIONS, 'decision');
  assertNonEmptyString(reason, 'reason');
  assertNonEmptyString(traceId, 'traceId');
  assertPlainObject(metadata, 'metadata');
  assertNonEmptyString(contractVersion, 'contractVersion');

  return freezeJson({
    contractVersion,
    id,
    occurredAt,
    actorAccountId,
    learnerId,
    action,
    resourceType,
    resourceId,
    permission,
    consentScope,
    decision,
    reason,
    traceId,
    metadata,
  });
}

export function createLearnerAccessAuditEvent({
  id,
  account,
  link,
  action,
  resourceType,
  resourceId,
  permission,
  consentScope = null,
  allowed,
  reason,
  traceId,
  occurredAt = new Date().toISOString(),
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertPlainObject(account, 'account');
  assertPlainObject(link, 'link');
  assertBoolean(allowed, 'allowed');

  return createAuditEvent({
    id,
    occurredAt,
    actorAccountId: account.id,
    learnerId: link.learnerId,
    action,
    resourceType,
    resourceId,
    permission,
    consentScope,
    decision: allowed ? 'allowed' : 'denied',
    reason,
    traceId,
    metadata: {
      relationship: link.relationship,
      linkId: link.id,
      accountRole: account.role,
      ...metadata,
    },
    contractVersion,
  });
}

export function summarizeAuditTrail(auditEvents) {
  assertArray(auditEvents, 'auditEvents');
  const countsByDecision = Object.fromEntries(AUDIT_DECISIONS.map((decision) => [decision, 0]));
  const countsByAction = {};
  const learnerIds = new Set();

  auditEvents.forEach((event) => {
    assertPlainObject(event, 'auditEvents item');
    assertEnum(event.action, AUDIT_ACTIONS, 'auditEvents.action');
    assertEnum(event.decision, AUDIT_DECISIONS, 'auditEvents.decision');
    countsByDecision[event.decision] += 1;
    countsByAction[event.action] = (countsByAction[event.action] ?? 0) + 1;
    if (event.learnerId !== null && event.learnerId !== undefined) {
      learnerIds.add(event.learnerId);
    }
  });

  return freezeJson({
    eventCount: auditEvents.length,
    learnerIds: [...learnerIds].sort(),
    countsByDecision,
    countsByAction,
  });
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new RangeError(`${fieldName} must be one of ${allowedValues.join(', ')}`);
  }
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array`);
  }
}

function assertBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${fieldName} must be a boolean`);
  }
}

function assertDateTime(value, fieldName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${fieldName} must be a valid date-time string`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
}

function assertOptionalString(value, fieldName) {
  if (value === null) return;
  assertNonEmptyString(value, fieldName);
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function freezeJson(value) {
  return deepFreeze(cloneJson(value));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
