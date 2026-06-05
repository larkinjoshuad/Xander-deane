import { CONTRACT_VERSION } from '../core/domain.js';

export const CONSENT_SCOPES = Object.freeze([
  'ai_tutoring',
  'personalization',
  'progress_tracking',
  'analytics',
  'voucher_billing',
  'guardian_notifications',
  'data_export',
]);

export const CONSENT_STATUSES = Object.freeze(['pending', 'granted', 'revoked', 'expired']);

export const SAFETY_ESCALATION_TRIGGERS = Object.freeze([
  'self_harm',
  'abuse_disclosure',
  'medical_emergency',
  'learner_distress',
  'unsafe_advice_request',
  'payment_dispute',
  'privacy_request',
]);

export const SAFETY_SEVERITIES = Object.freeze(['info', 'low', 'medium', 'high', 'critical']);

export const SAFETY_CATEGORIES = Object.freeze([
  'consent',
  'privacy',
  'content_safety',
  'learner_wellbeing',
  'billing',
  'security',
  'accessibility',
]);

export function createConsentRecord({
  id,
  learnerId,
  guardianId = null,
  status = 'granted',
  source = 'guardian_portal',
  grantedScopes = [],
  deniedScopes = [],
  collectedAt = new Date().toISOString(),
  expiresAt = null,
  revokedAt = null,
  locale = 'en-US',
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertNonEmptyString(learnerId, 'learnerId');
  assertOptionalString(guardianId, 'guardianId');
  assertEnum(status, CONSENT_STATUSES, 'status');
  assertEnum(source, ['guardian_portal', 'school_admin', 'provider_import', 'paper_form', 'system_migration'], 'source');
  assertConsentScopes(grantedScopes, 'grantedScopes');
  assertConsentScopes(deniedScopes, 'deniedScopes');
  assertDateTime(collectedAt, 'collectedAt');
  assertOptionalDateTime(expiresAt, 'expiresAt');
  assertOptionalDateTime(revokedAt, 'revokedAt');
  assertNonEmptyString(locale, 'locale');
  assertPlainObject(metadata, 'metadata');
  assertNonEmptyString(contractVersion, 'contractVersion');

  const overlappingScopes = grantedScopes.filter((scope) => deniedScopes.includes(scope));
  if (overlappingScopes.length > 0) {
    throw new RangeError(`consent scopes cannot be both granted and denied: ${overlappingScopes.join(', ')}`);
  }
  if (status === 'revoked' && revokedAt === null) {
    throw new TypeError('revokedAt is required when status is revoked');
  }

  return freezeJson({
    contractVersion,
    id,
    learnerId,
    guardianId,
    status,
    source,
    grantedScopes,
    deniedScopes,
    collectedAt,
    expiresAt,
    revokedAt,
    locale,
    metadata,
  });
}

export function hasActiveConsent(consentRecord, { scope, at = new Date().toISOString() }) {
  assertPlainObject(consentRecord, 'consentRecord');
  assertEnum(scope, CONSENT_SCOPES, 'scope');
  assertDateTime(at, 'at');

  if (consentRecord.status !== 'granted') return false;
  if (consentRecord.deniedScopes?.includes(scope)) return false;
  if (!consentRecord.grantedScopes?.includes(scope)) return false;
  if (consentRecord.revokedAt !== null && consentRecord.revokedAt !== undefined) return false;
  if (consentRecord.expiresAt !== null && consentRecord.expiresAt !== undefined && Date.parse(consentRecord.expiresAt) <= Date.parse(at)) {
    return false;
  }
  return true;
}

export function assertConsentAllows(consentRecord, scope, options = {}) {
  if (!hasActiveConsent(consentRecord, { scope, at: options.at ?? new Date().toISOString() })) {
    throw new RangeError(`active consent is required for ${scope}`);
  }
  return consentRecord;
}

export function revokeConsent(consentRecord, {
  revokedAt = new Date().toISOString(),
  reason = 'guardian_request',
} = {}) {
  assertPlainObject(consentRecord, 'consentRecord');
  assertDateTime(revokedAt, 'revokedAt');
  assertNonEmptyString(reason, 'reason');

  return createConsentRecord({
    ...consentRecord,
    status: 'revoked',
    revokedAt,
    metadata: {
      ...consentRecord.metadata,
      revocationReason: reason,
    },
  });
}

export function createSafetyPolicy({
  id,
  learnerAgeBand = 'unknown',
  allowedContentCategories = ['curriculum_instruction', 'encouragement', 'study_skills'],
  blockedContentCategories = ['unsafe_advice', 'shaming', 'adult_content', 'medical_or_legal_advice'],
  escalationTriggers = ['self_harm', 'abuse_disclosure', 'medical_emergency', 'learner_distress'],
  aiAutonomyLevel = 'guided_only',
  requiresHumanEscalation = true,
  maxSessionMinutes = 30,
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertEnum(learnerAgeBand, ['minor_under_13', 'minor_13_to_17', 'adult', 'unknown'], 'learnerAgeBand');
  assertStringArray(allowedContentCategories, 'allowedContentCategories');
  assertStringArray(blockedContentCategories, 'blockedContentCategories');
  assertArray(escalationTriggers, 'escalationTriggers');
  escalationTriggers.forEach((trigger) => assertEnum(trigger, SAFETY_ESCALATION_TRIGGERS, 'escalationTriggers'));
  assertEnum(aiAutonomyLevel, ['disabled', 'scripted_only', 'guided_only', 'adaptive_with_review'], 'aiAutonomyLevel');
  assertBoolean(requiresHumanEscalation, 'requiresHumanEscalation');
  assertPositiveInteger(maxSessionMinutes, 'maxSessionMinutes');
  assertPlainObject(metadata, 'metadata');
  assertNonEmptyString(contractVersion, 'contractVersion');

  return freezeJson({
    contractVersion,
    id,
    learnerAgeBand,
    allowedContentCategories,
    blockedContentCategories,
    escalationTriggers,
    aiAutonomyLevel,
    requiresHumanEscalation,
    maxSessionMinutes,
    metadata,
  });
}

export function evaluateTutorSafety({
  tutorResponse,
  safetyPolicy,
  consentRecord = null,
  requestedScopes = [],
  detectedContentCategories = [],
  detectedEscalationTriggers = [],
  checkedAt = new Date().toISOString(),
  contractVersion = CONTRACT_VERSION,
}) {
  assertPlainObject(tutorResponse, 'tutorResponse');
  assertPlainObject(safetyPolicy, 'safetyPolicy');
  assertNullableObject(consentRecord, 'consentRecord');
  assertConsentScopes(requestedScopes, 'requestedScopes');
  assertStringArray(detectedContentCategories, 'detectedContentCategories');
  assertArray(detectedEscalationTriggers, 'detectedEscalationTriggers');
  detectedEscalationTriggers.forEach((trigger) => assertEnum(trigger, SAFETY_ESCALATION_TRIGGERS, 'detectedEscalationTriggers'));
  assertDateTime(checkedAt, 'checkedAt');
  assertNonEmptyString(contractVersion, 'contractVersion');

  const blockedReasons = [];
  const requiredActions = [];

  if (safetyPolicy.aiAutonomyLevel === 'disabled' && requestedScopes.includes('ai_tutoring')) {
    blockedReasons.push('ai_tutoring_disabled_by_policy');
  }

  requestedScopes.forEach((scope) => {
    if (consentRecord === null || !hasActiveConsent(consentRecord, { scope, at: checkedAt })) {
      blockedReasons.push(`missing_active_consent:${scope}`);
    }
  });

  detectedContentCategories.forEach((category) => {
    if (safetyPolicy.blockedContentCategories.includes(category)) {
      blockedReasons.push(`blocked_content_category:${category}`);
    }
  });

  detectedEscalationTriggers.forEach((trigger) => {
    if (safetyPolicy.escalationTriggers.includes(trigger)) {
      blockedReasons.push(`escalation_trigger:${trigger}`);
      if (safetyPolicy.requiresHumanEscalation) {
        requiredActions.push('human_review');
      }
    }
  });

  if (blockedReasons.length > 0 && !requiredActions.includes('block_tutor_response')) {
    requiredActions.unshift('block_tutor_response');
  }

  return freezeJson({
    contractVersion,
    allowed: blockedReasons.length === 0,
    blockedReasons,
    requiredActions,
    checkedAt,
  });
}

export function createSafetyIncident({
  id,
  sessionId,
  learnerId = null,
  policyId,
  severity = 'low',
  category,
  trigger,
  description,
  actionTaken = 'logged_only',
  occurredAt = new Date().toISOString(),
  relatedEventId = null,
  tutorResponseId = null,
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertNonEmptyString(sessionId, 'sessionId');
  assertOptionalString(learnerId, 'learnerId');
  assertNonEmptyString(policyId, 'policyId');
  assertEnum(severity, SAFETY_SEVERITIES, 'severity');
  assertEnum(category, SAFETY_CATEGORIES, 'category');
  assertNonEmptyString(trigger, 'trigger');
  assertNonEmptyString(description, 'description');
  assertEnum(actionTaken, ['blocked', 'redirected', 'guardian_notified', 'educator_notified', 'human_review', 'logged_only'], 'actionTaken');
  assertDateTime(occurredAt, 'occurredAt');
  assertOptionalString(relatedEventId, 'relatedEventId');
  assertOptionalString(tutorResponseId, 'tutorResponseId');
  assertPlainObject(metadata, 'metadata');
  assertNonEmptyString(contractVersion, 'contractVersion');

  return freezeJson({
    contractVersion,
    id,
    sessionId,
    learnerId,
    policyId,
    severity,
    category,
    trigger,
    description,
    actionTaken,
    occurredAt,
    relatedEventId,
    tutorResponseId,
    metadata,
  });
}

export function createDataRetentionPolicy({
  id,
  jurisdiction,
  recordType,
  retentionDays,
  deleteOnConsentRevocation = false,
  exportableByGuardian = true,
  requiresAuditTrail = true,
  effectiveAt = new Date().toISOString(),
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertNonEmptyString(jurisdiction, 'jurisdiction');
  assertEnum(recordType, ['learner_profile', 'session_record', 'interaction_event', 'progress_summary', 'voucher_billing', 'safety_incident', 'audit_log'], 'recordType');
  assertPositiveInteger(retentionDays, 'retentionDays');
  assertBoolean(deleteOnConsentRevocation, 'deleteOnConsentRevocation');
  assertBoolean(exportableByGuardian, 'exportableByGuardian');
  assertBoolean(requiresAuditTrail, 'requiresAuditTrail');
  assertDateTime(effectiveAt, 'effectiveAt');
  assertPlainObject(metadata, 'metadata');
  assertNonEmptyString(contractVersion, 'contractVersion');

  return freezeJson({
    contractVersion,
    id,
    jurisdiction,
    recordType,
    retentionDays,
    deleteOnConsentRevocation,
    exportableByGuardian,
    requiresAuditTrail,
    effectiveAt,
    metadata,
  });
}

export function summarizeConsentSafety({ consentRecord = null, safetyPolicy = null, at = new Date().toISOString() }) {
  assertNullableObject(consentRecord, 'consentRecord');
  assertNullableObject(safetyPolicy, 'safetyPolicy');
  assertDateTime(at, 'at');

  return freezeJson({
    consentStatus: consentRecord?.status ?? 'missing',
    activeScopes: consentRecord
      ? CONSENT_SCOPES.filter((scope) => hasActiveConsent(consentRecord, { scope, at }))
      : [],
    safetyPolicyId: safetyPolicy?.id ?? null,
    aiAutonomyLevel: safetyPolicy?.aiAutonomyLevel ?? 'unknown',
    requiresHumanEscalation: safetyPolicy?.requiresHumanEscalation ?? true,
  });
}

function assertConsentScopes(value, fieldName) {
  assertArray(value, fieldName);
  value.forEach((scope) => assertEnum(scope, CONSENT_SCOPES, fieldName));
}

function assertNullableObject(value, fieldName) {
  if (value === null) return;
  assertPlainObject(value, fieldName);
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new RangeError(`${fieldName} must be one of ${allowedValues.join(', ')}`);
  }
}

function assertDateTime(value, fieldName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${fieldName} must be a valid date-time`);
  }
}

function assertOptionalDateTime(value, fieldName) {
  if (value === null) return;
  assertDateTime(value, fieldName);
}

function assertBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${fieldName} must be a boolean`);
  }
}

function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${fieldName} must be a positive integer`);
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

function assertStringArray(value, fieldName) {
  assertArray(value, fieldName);
  value.forEach((item) => assertNonEmptyString(item, fieldName));
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
