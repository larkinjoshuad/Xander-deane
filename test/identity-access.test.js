import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createConsentRecord } from '../src/app/consent-safety.js';
import {
  assertCanGrantConsentForLearner,
  assertLearnerAccess,
  canAccessLearner,
  canGrantConsentForLearner,
  createAccount,
  createLearnerAccountLink,
  summarizeLearnerAccess,
} from '../src/app/identity-access.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const accountSchema = readJson('schemas/account.schema.json');
const learnerAccountLinkSchema = readJson('schemas/learner-account-link.schema.json');
const fixedNow = '2026-05-29T00:00:00.000Z';

test('creates schema-compatible accounts and learner-account links', () => {
  const account = createAccount({
    id: 'guardian_test_001',
    role: 'guardian',
    displayName: 'Test Guardian',
    createdAt: fixedNow,
  });
  const link = createLearnerAccountLink({
    id: 'link_guardian_test_001',
    accountId: account.id,
    learnerId: 'learner_test_001',
    relationship: 'parent_guardian',
    createdAt: fixedNow,
  });

  assert.deepEqual(validateJsonSchema(account, accountSchema), []);
  assert.deepEqual(validateJsonSchema(link, learnerAccountLinkSchema), []);
  assert.equal(Object.isFrozen(account), true);
  assert.equal(Object.isFrozen(link), true);
  assert.ok(link.permissions.includes('grant_consent'));
  assert.ok(link.permissions.includes('manage_vouchers'));
});

test('enforces learner-scoped permissions and account status', () => {
  const account = createAccount({
    id: 'educator_test_001',
    role: 'educator',
    displayName: 'Test Educator',
    createdAt: fixedNow,
  });
  const link = createLearnerAccountLink({
    id: 'link_teacher_test_001',
    accountId: account.id,
    learnerId: 'learner_test_001',
    relationship: 'teacher',
    createdAt: fixedNow,
  });

  assert.equal(canAccessLearner({ account, link, learnerId: 'learner_test_001', permission: 'view_progress', at: fixedNow }), true);
  assert.equal(canAccessLearner({ account, link, learnerId: 'learner_test_001', permission: 'manage_vouchers', at: fixedNow }), false);
  assert.throws(
    () => assertLearnerAccess({ account, link, learnerId: 'learner_other_001', permission: 'view_progress', at: fixedNow }),
    /not authorized/,
  );
});

test('checks consent grant authority against guardian account and learner link', () => {
  const account = createAccount({
    id: 'guardian_test_002',
    role: 'guardian',
    displayName: 'Consent Guardian',
    createdAt: fixedNow,
  });
  const link = createLearnerAccountLink({
    id: 'link_guardian_test_002',
    accountId: account.id,
    learnerId: 'learner_test_002',
    relationship: 'parent_guardian',
    createdAt: fixedNow,
  });
  const consentRecord = createConsentRecord({
    id: 'consent_identity_test_001',
    learnerId: 'learner_test_002',
    guardianId: account.id,
    grantedScopes: ['ai_tutoring', 'progress_tracking'],
    collectedAt: fixedNow,
  });

  assert.equal(canGrantConsentForLearner({ account, link, consentRecord, at: fixedNow }), true);
  assert.doesNotThrow(() => assertCanGrantConsentForLearner({ account, link, consentRecord, at: fixedNow }));

  const educator = createAccount({
    id: 'educator_test_002',
    role: 'educator',
    displayName: 'No Consent Teacher',
    createdAt: fixedNow,
  });
  const teacherLink = createLearnerAccountLink({
    id: 'link_teacher_test_002',
    accountId: educator.id,
    learnerId: 'learner_test_002',
    relationship: 'teacher',
    createdAt: fixedNow,
  });
  assert.equal(canGrantConsentForLearner({ account: educator, link: teacherLink, consentRecord, at: fixedNow }), false);
});

test('summarizes learner access for dashboards and service guards', () => {
  const account = createAccount({
    id: 'guardian_test_003',
    role: 'guardian',
    displayName: 'Summary Guardian',
    createdAt: fixedNow,
  });
  const link = createLearnerAccountLink({
    id: 'link_guardian_test_003',
    accountId: account.id,
    learnerId: 'learner_test_003',
    relationship: 'parent_guardian',
    permissions: ['grant_consent', 'view_progress', 'manage_vouchers'],
    createdAt: fixedNow,
  });

  assert.deepEqual(summarizeLearnerAccess({ account, link, learnerId: 'learner_test_003', at: fixedNow }), {
    accountId: 'guardian_test_003',
    learnerId: 'learner_test_003',
    relationship: 'parent_guardian',
    activePermissions: ['grant_consent', 'view_progress', 'manage_vouchers'],
    canGrantConsent: true,
    canManageVouchers: true,
    canReviewSafety: false,
  });
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
