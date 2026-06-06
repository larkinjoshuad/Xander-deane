import { CONTRACT_VERSION } from '../core/domain.js';

export const ACCOUNT_ROLES = Object.freeze(['guardian', 'educator', 'operator', 'learner']);
export const ACCOUNT_STATUSES = Object.freeze(['invited', 'active', 'suspended', 'closed']);
export const LEARNER_RELATIONSHIPS = Object.freeze([
  'parent_guardian',
  'teacher',
  'school_admin',
  'case_manager',
  'learner_self',
  'operator',
]);
export const LEARNER_PERMISSIONS = Object.freeze([
  'grant_consent',
  'view_progress',
  'assign_content',
  'manage_vouchers',
  'export_data',
  'delete_data',
  'review_safety',
  'manage_sessions',
]);
export const LINK_STATUSES = Object.freeze(['active', 'pending', 'revoked', 'expired']);

const DEFAULT_PERMISSIONS_BY_RELATIONSHIP = Object.freeze({
  parent_guardian: ['grant_consent', 'view_progress', 'manage_vouchers', 'export_data', 'delete_data', 'manage_sessions'],
  teacher: ['view_progress', 'assign_content', 'manage_sessions'],
  school_admin: ['view_progress', 'assign_content', 'review_safety', 'manage_sessions'],
  case_manager: ['view_progress', 'review_safety'],
  learner_self: ['view_progress'],
  operator: ['review_safety', 'manage_sessions'],
});

export function createAccount({
  id,
  role,
  displayName,
  status = 'active',
  locale = 'en-US',
  createdAt = new Date().toISOString(),
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertEnum(role, ACCOUNT_ROLES, 'role');
  assertNonEmptyString(displayName, 'displayName');
  assertEnum(status, ACCOUNT_STATUSES, 'status');
  assertNonEmptyString(locale, 'locale');
  assertDateTime(createdAt, 'createdAt');
  assertPlainObject(metadata, 'metadata');
  assertNonEmptyString(contractVersion, 'contractVersion');

  return freezeJson({
    contractVersion,
    id,
    role,
    displayName,
    status,
    locale,
    createdAt,
    metadata,
  });
}

export function createLearnerAccountLink({
  id,
  accountId,
  learnerId,
  relationship,
  permissions = DEFAULT_PERMISSIONS_BY_RELATIONSHIP[relationship] ?? [],
  status = 'active',
  createdAt = new Date().toISOString(),
  expiresAt = null,
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertNonEmptyString(accountId, 'accountId');
  assertNonEmptyString(learnerId, 'learnerId');
  assertEnum(relationship, LEARNER_RELATIONSHIPS, 'relationship');
  assertArray(permissions, 'permissions');
  permissions.forEach((permission) => assertEnum(permission, LEARNER_PERMISSIONS, 'permissions'));
  assertEnum(status, LINK_STATUSES, 'status');
  assertDateTime(createdAt, 'createdAt');
  assertOptionalDateTime(expiresAt, 'expiresAt');
  assertPlainObject(metadata, 'metadata');
  assertNonEmptyString(contractVersion, 'contractVersion');

  return freezeJson({
    contractVersion,
    id,
    accountId,
    learnerId,
    relationship,
    permissions,
    status,
    createdAt,
    expiresAt,
    metadata,
  });
}

export function canAccessLearner({ account, link, learnerId, permission, at = new Date().toISOString() }) {
  assertPlainObject(account, 'account');
  assertPlainObject(link, 'link');
  assertNonEmptyString(learnerId, 'learnerId');
  assertEnum(permission, LEARNER_PERMISSIONS, 'permission');
  assertDateTime(at, 'at');

  if (account.status !== 'active') return false;
  if (link.status !== 'active') return false;
  if (link.accountId !== account.id) return false;
  if (link.learnerId !== learnerId) return false;
  if (!link.permissions.includes(permission)) return false;
  if (link.expiresAt !== null && Date.parse(link.expiresAt) <= Date.parse(at)) return false;
  return true;
}

export function assertLearnerAccess({ account, link, learnerId, permission, at = new Date().toISOString() }) {
  if (!canAccessLearner({ account, link, learnerId, permission, at })) {
    throw new RangeError(`account ${account?.id ?? 'unknown'} is not authorized to ${permission} for learner ${learnerId}`);
  }
  return link;
}

export function canGrantConsentForLearner({ account, link, consentRecord, at = new Date().toISOString() }) {
  assertPlainObject(consentRecord, 'consentRecord');
  return canAccessLearner({
    account,
    link,
    learnerId: consentRecord.learnerId,
    permission: 'grant_consent',
    at,
  }) && (consentRecord.guardianId === null || consentRecord.guardianId === account.id);
}

export function assertCanGrantConsentForLearner({ account, link, consentRecord, at = new Date().toISOString() }) {
  if (!canGrantConsentForLearner({ account, link, consentRecord, at })) {
    throw new RangeError(`account ${account?.id ?? 'unknown'} cannot grant consent ${consentRecord?.id ?? 'unknown'}`);
  }
  return consentRecord;
}

export function summarizeLearnerAccess({ account, link, learnerId, at = new Date().toISOString() }) {
  assertPlainObject(account, 'account');
  assertPlainObject(link, 'link');
  assertNonEmptyString(learnerId, 'learnerId');
  assertDateTime(at, 'at');

  const activePermissions = LEARNER_PERMISSIONS.filter((permission) =>
    canAccessLearner({ account, link, learnerId, permission, at }),
  );

  return freezeJson({
    accountId: account.id,
    learnerId,
    relationship: link.relationship,
    activePermissions,
    canGrantConsent: activePermissions.includes('grant_consent'),
    canManageVouchers: activePermissions.includes('manage_vouchers'),
    canReviewSafety: activePermissions.includes('review_safety'),
  });
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new RangeError(`${fieldName} must be one of ${allowedValues.join(', ')}`);
  }
}

function assertOptionalDateTime(value, fieldName) {
  if (value === null) return;
  assertDateTime(value, fieldName);
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

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array`);
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
