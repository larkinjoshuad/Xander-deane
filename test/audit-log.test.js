import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createAccount, createLearnerAccountLink } from '../src/app/identity-access.js';
import {
  createAuditEvent,
  createLearnerAccessAuditEvent,
  summarizeAuditTrail,
} from '../src/app/audit-log.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const auditEventSchema = readJson('schemas/audit-event.schema.json');
const fixedNow = '2026-05-29T00:00:00.000Z';

test('creates schema-compatible immutable audit events', () => {
  const auditEvent = createAuditEvent({
    id: 'audit_test_001',
    occurredAt: fixedNow,
    actorAccountId: 'acct_test_001',
    learnerId: 'learner_test_001',
    action: 'session.create',
    resourceType: 'session',
    resourceId: 'session_test_001',
    permission: 'manage_sessions',
    consentScope: 'progress_tracking',
    decision: 'allowed',
    reason: 'guardian has active learner link and consent',
    traceId: 'trace_test_001',
  });

  assert.deepEqual(validateJsonSchema(auditEvent, auditEventSchema), []);
  assert.equal(Object.isFrozen(auditEvent), true);
  assert.equal(Object.isFrozen(auditEvent.metadata), true);
});

test('creates learner-access audit events from account and learner link context', () => {
  const account = createAccount({
    id: 'guardian_audit_test_001',
    role: 'guardian',
    displayName: 'Audit Guardian',
    createdAt: fixedNow,
  });
  const link = createLearnerAccountLink({
    id: 'link_audit_test_001',
    accountId: account.id,
    learnerId: 'learner_audit_test_001',
    relationship: 'parent_guardian',
    createdAt: fixedNow,
  });

  const auditEvent = createLearnerAccessAuditEvent({
    id: 'audit_access_test_001',
    account,
    link,
    action: 'event.append',
    resourceType: 'interaction_event',
    resourceId: 'event_audit_test_001',
    permission: 'manage_sessions',
    consentScope: 'progress_tracking',
    allowed: true,
    reason: 'event append allowed for guardian-managed session',
    traceId: 'trace_access_test_001',
    occurredAt: fixedNow,
  });

  assert.deepEqual(validateJsonSchema(auditEvent, auditEventSchema), []);
  assert.equal(auditEvent.actorAccountId, account.id);
  assert.equal(auditEvent.learnerId, link.learnerId);
  assert.equal(auditEvent.decision, 'allowed');
  assert.equal(auditEvent.metadata.linkId, link.id);
  assert.equal(auditEvent.metadata.accountRole, 'guardian');
});

test('summarizes audit trails by learner, action, and decision', () => {
  const allowed = createAuditEvent({
    id: 'audit_summary_allowed_001',
    occurredAt: fixedNow,
    actorAccountId: 'acct_summary_001',
    learnerId: 'learner_summary_001',
    action: 'session.read',
    resourceType: 'session',
    resourceId: 'session_summary_001',
    permission: 'manage_sessions',
    decision: 'allowed',
    reason: 'session read allowed',
    traceId: 'trace_summary_001',
  });
  const denied = createAuditEvent({
    id: 'audit_summary_denied_001',
    occurredAt: fixedNow,
    actorAccountId: 'acct_summary_002',
    learnerId: 'learner_summary_001',
    action: 'data.export',
    resourceType: 'learner_profile',
    resourceId: 'learner_summary_001',
    permission: 'export_data',
    consentScope: 'data_export',
    decision: 'denied',
    reason: 'missing data export permission',
    traceId: 'trace_summary_002',
  });

  assert.deepEqual(summarizeAuditTrail([allowed, denied]), {
    eventCount: 2,
    learnerIds: ['learner_summary_001'],
    countsByDecision: {
      allowed: 1,
      denied: 1,
      logged: 0,
      escalated: 0,
    },
    countsByAction: {
      'session.read': 1,
      'data.export': 1,
    },
  });
});

test('rejects invalid audit actions and malformed trace ids', () => {
  assert.throws(
    () => createAuditEvent({
      id: 'audit_invalid_001',
      action: 'session.overwrite',
      resourceType: 'session',
      resourceId: 'session_invalid_001',
      decision: 'logged',
      reason: 'invalid action should fail',
      traceId: 'trace_invalid_001',
    }),
    /action must be one of/,
  );

  assert.throws(
    () => createAuditEvent({
      id: 'audit_invalid_002',
      action: 'session.read',
      resourceType: 'session',
      resourceId: 'session_invalid_002',
      decision: 'logged',
      reason: 'blank trace id should fail',
      traceId: ' ',
    }),
    /traceId must be a non-empty string/,
  );
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
