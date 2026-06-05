import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  assertConsentAllows,
  createConsentRecord,
  createDataRetentionPolicy,
  createSafetyIncident,
  createSafetyPolicy,
  evaluateTutorSafety,
  hasActiveConsent,
  revokeConsent,
  summarizeConsentSafety,
} from '../src/app/consent-safety.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const consentSchema = readJson('schemas/consent-record.schema.json');
const safetyPolicySchema = readJson('schemas/safety-policy.schema.json');
const safetyIncidentSchema = readJson('schemas/safety-incident.schema.json');
const dataRetentionPolicySchema = readJson('schemas/data-retention-policy.schema.json');
const fixedNow = '2026-05-29T00:00:00.000Z';

const tutorResponse = Object.freeze({
  id: 'resp_safety_001',
  feedbackType: 'hint',
  messageText: 'Try counting each equal group one at a time.',
});

test('creates schema-compatible consent, safety, incident, and retention records', () => {
  const consentRecord = createConsentRecord({
    id: 'consent_test_001',
    learnerId: 'learner_test_001',
    guardianId: 'guardian_test_001',
    grantedScopes: ['ai_tutoring', 'personalization', 'progress_tracking'],
    deniedScopes: ['analytics'],
    collectedAt: fixedNow,
    expiresAt: '2027-05-29T00:00:00.000Z',
  });
  const safetyPolicy = createSafetyPolicy({
    id: 'safety.test.minor',
    learnerAgeBand: 'minor_under_13',
  });
  const safetyIncident = createSafetyIncident({
    id: 'incident_test_001',
    sessionId: 'ses_test_001',
    learnerId: 'learner_test_001',
    policyId: safetyPolicy.id,
    category: 'content_safety',
    trigger: 'unsafe_advice_request',
    description: 'Unsafe tutor response was blocked.',
    actionTaken: 'blocked',
    occurredAt: fixedNow,
  });
  const retentionPolicy = createDataRetentionPolicy({
    id: 'retention.test.session',
    jurisdiction: 'US',
    recordType: 'session_record',
    retentionDays: 365,
    effectiveAt: fixedNow,
  });

  assert.deepEqual(validateJsonSchema(consentRecord, consentSchema), []);
  assert.deepEqual(validateJsonSchema(safetyPolicy, safetyPolicySchema), []);
  assert.deepEqual(validateJsonSchema(safetyIncident, safetyIncidentSchema), []);
  assert.deepEqual(validateJsonSchema(retentionPolicy, dataRetentionPolicySchema), []);
  assert.equal(Object.isFrozen(consentRecord), true);
  assert.equal(Object.isFrozen(safetyPolicy), true);
});

test('checks active consent and preserves revocation audit metadata', () => {
  const consentRecord = createConsentRecord({
    id: 'consent_test_002',
    learnerId: 'learner_test_002',
    guardianId: 'guardian_test_002',
    grantedScopes: ['ai_tutoring', 'data_export'],
    deniedScopes: ['analytics'],
    collectedAt: fixedNow,
    expiresAt: '2027-05-29T00:00:00.000Z',
  });

  assert.equal(hasActiveConsent(consentRecord, { scope: 'ai_tutoring', at: fixedNow }), true);
  assert.equal(hasActiveConsent(consentRecord, { scope: 'analytics', at: fixedNow }), false);
  assert.doesNotThrow(() => assertConsentAllows(consentRecord, 'data_export', { at: fixedNow }));
  assert.throws(() => assertConsentAllows(consentRecord, 'analytics', { at: fixedNow }), /active consent is required/);

  const revoked = revokeConsent(consentRecord, {
    revokedAt: '2026-06-01T00:00:00.000Z',
    reason: 'guardian_request',
  });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.metadata.revocationReason, 'guardian_request');
  assert.equal(hasActiveConsent(revoked, { scope: 'ai_tutoring', at: '2026-06-02T00:00:00.000Z' }), false);
});

test('blocks tutor output when consent is missing or safety policy is triggered', () => {
  const consentRecord = createConsentRecord({
    id: 'consent_test_003',
    learnerId: 'learner_test_003',
    guardianId: 'guardian_test_003',
    grantedScopes: ['personalization'],
    deniedScopes: ['ai_tutoring'],
    collectedAt: fixedNow,
  });
  const safetyPolicy = createSafetyPolicy({
    id: 'safety.test.blocking',
    blockedContentCategories: ['unsafe_advice'],
    escalationTriggers: ['unsafe_advice_request'],
  });

  const evaluation = evaluateTutorSafety({
    tutorResponse,
    safetyPolicy,
    consentRecord,
    requestedScopes: ['ai_tutoring'],
    detectedContentCategories: ['unsafe_advice'],
    detectedEscalationTriggers: ['unsafe_advice_request'],
    checkedAt: fixedNow,
  });

  assert.equal(evaluation.allowed, false);
  assert.deepEqual(evaluation.requiredActions, ['block_tutor_response', 'human_review']);
  assert.ok(evaluation.blockedReasons.includes('missing_active_consent:ai_tutoring'));
  assert.ok(evaluation.blockedReasons.includes('blocked_content_category:unsafe_advice'));
  assert.ok(evaluation.blockedReasons.includes('escalation_trigger:unsafe_advice_request'));
});

test('summarizes consent and safety state for model gateway decisions', () => {
  const consentRecord = createConsentRecord({
    id: 'consent_test_004',
    learnerId: 'learner_test_004',
    grantedScopes: ['ai_tutoring', 'progress_tracking'],
    deniedScopes: ['analytics'],
    collectedAt: fixedNow,
  });
  const safetyPolicy = createSafetyPolicy({
    id: 'safety.test.summary',
    learnerAgeBand: 'minor_13_to_17',
    aiAutonomyLevel: 'scripted_only',
  });

  assert.deepEqual(summarizeConsentSafety({ consentRecord, safetyPolicy, at: fixedNow }), {
    consentStatus: 'granted',
    activeScopes: ['ai_tutoring', 'progress_tracking'],
    safetyPolicyId: 'safety.test.summary',
    aiAutonomyLevel: 'scripted_only',
    requiresHumanEscalation: true,
  });
});

test('rejects overlapping consent grants and denials', () => {
  assert.throws(
    () => createConsentRecord({
      id: 'consent_test_005',
      learnerId: 'learner_test_005',
      grantedScopes: ['analytics'],
      deniedScopes: ['analytics'],
      collectedAt: fixedNow,
    }),
    /both granted and denied/,
  );
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
