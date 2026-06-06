import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createInitialLearningSession,
  placeSelectedCounter,
  selectCounter,
} from '../src/app/learning-session.js';
import { createConsentRecord, revokeConsent } from '../src/app/consent-safety.js';
import { createAccount, createLearnerAccountLink } from '../src/app/identity-access.js';
import {
  createAccessControlledSessionService,
  createFileAuditEventStore,
  createInMemoryAuditEventStore,
} from '../src/app/session-access-service.js';
import { createSessionPersistenceService } from '../src/app/session-service.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const auditEventSchema = readJson('schemas/audit-event.schema.json');
const dataInventory = readJson('examples/governance/base.data-inventory.json');
const retentionPolicy = readJson('examples/safety/session.data-retention-policy.json');
const fixedNow = () => '2026-05-29T00:00:00.000Z';

function createMathSession(sessionId = 'ses_access_math_001') {
  return createInitialLearningSession({
    sessionId,
    learnerId: 'learner_access_001',
    objective,
    problem,
    now: fixedNow,
  });
}

function createGuardianContext(overrides = {}) {
  const account = createAccount({
    id: overrides.accountId ?? 'guardian_access_001',
    role: 'guardian',
    displayName: 'Access Guardian',
    createdAt: fixedNow(),
  });
  const link = createLearnerAccountLink({
    id: overrides.linkId ?? 'link_access_guardian_001',
    accountId: account.id,
    learnerId: overrides.learnerId ?? 'learner_access_001',
    relationship: 'parent_guardian',
    permissions: overrides.permissions,
    createdAt: fixedNow(),
  });
  const consentRecord = createConsentRecord({
    id: overrides.consentId ?? 'consent_access_001',
    learnerId: overrides.consentLearnerId ?? link.learnerId,
    guardianId: account.id,
    grantedScopes: overrides.grantedScopes ?? ['progress_tracking', 'personalization', 'data_export'],
    collectedAt: fixedNow(),
  });

  return {
    account,
    link,
    consentRecord,
    dataInventory: overrides.dataInventory ?? dataInventory,
    retentionPolicy: overrides.retentionPolicy ?? retentionPolicy,
    traceId: overrides.traceId ?? 'trace_access_test_001',
    auditEventId: overrides.auditEventId,
  };
}

test('access-controlled service saves sessions and records allowed audit events', async () => {
  const auditEventStore = createInMemoryAuditEventStore();
  const service = createAccessControlledSessionService({
    sessionService: createSessionPersistenceService({ now: fixedNow }),
    auditEventStore,
    now: fixedNow,
  });
  const record = await service.saveSession(createMathSession(), {
    ...createGuardianContext(),
    auditEventId: 'audit_access_save_allowed_001',
  });
  const auditEvents = await service.listAuditEvents();

  assert.equal(record.sessionId, 'ses_access_math_001');
  assert.equal(auditEvents.length, 1);
  assert.deepEqual(validateJsonSchema(auditEvents[0], auditEventSchema), []);
  assert.equal(auditEvents[0].action, 'session.create');
  assert.equal(auditEvents[0].decision, 'allowed');
  assert.equal(auditEvents[0].permission, 'manage_sessions');
  assert.equal(auditEvents[0].consentScope, 'progress_tracking');
});

test('access-controlled service appends events and snapshots with audit trail', async () => {
  const service = createAccessControlledSessionService({
    sessionService: createSessionPersistenceService({ now: fixedNow }),
    now: fixedNow,
  });
  const context = createGuardianContext();
  let session = createMathSession('ses_access_append_001');
  await service.saveSession(session, { ...context, auditEventId: 'audit_access_append_save_001' });

  session = selectCounter(session, 'counter_1');
  session = placeSelectedCounter(session, 'group_1', fixedNow);
  const event = session.events.at(-1);
  await service.appendInteractionEvent(session.sessionId, event, { ...context, auditEventId: 'audit_access_append_event_001' });
  await service.appendWorkspaceSnapshot(session.sessionId, session.workspaceSnapshot, { ...context, auditEventId: 'audit_access_append_snapshot_001' });

  const auditEvents = await service.listAuditEvents({ decision: 'allowed' });
  assert.deepEqual(auditEvents.map((auditEvent) => auditEvent.action), ['session.create', 'event.append', 'snapshot.append']);
});


test('file-backed audit event store persists allowed and denied access events', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-audit-store-'));
  try {
    const auditEventStore = createFileAuditEventStore({ directory });
    const service = createAccessControlledSessionService({
      sessionService: createSessionPersistenceService({ now: fixedNow }),
      auditEventStore,
      now: fixedNow,
    });
    const context = createGuardianContext();
    await service.saveSession(createMathSession('ses_access_file_audit_001'), {
      ...context,
      auditEventId: 'audit_access_file_allowed_001',
    });
    await assert.rejects(
      () => service.saveSession(createMathSession('ses_access_file_audit_denied_001'), {
        ...createGuardianContext({ permissions: ['view_progress'] }),
        auditEventId: 'audit_access_file_denied_001',
      }),
      /not authorized to manage_sessions/,
    );

    const secondStore = createFileAuditEventStore({ directory });
    const persistedEvents = await secondStore.listAuditEvents();
    const rawAuditLog = await readFile(join(directory, 'audit-events.jsonl'), 'utf8');

    assert.deepEqual(persistedEvents.map((event) => event.id), [
      'audit_access_file_allowed_001',
      'audit_access_file_denied_001',
    ]);
    assert.deepEqual(persistedEvents.map((event) => event.decision), ['allowed', 'denied']);
    assert.equal(rawAuditLog.trim().split('\n').length, 2);

    await secondStore.clearAuditEvents();
    assert.deepEqual(await secondStore.listAuditEvents(), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('access-controlled service records denied audits for missing permissions', async () => {
  const service = createAccessControlledSessionService({
    sessionService: createSessionPersistenceService({ now: fixedNow }),
    now: fixedNow,
  });
  const context = createGuardianContext({ permissions: ['view_progress'] });

  await assert.rejects(
    () => service.saveSession(createMathSession('ses_access_denied_001'), {
      ...context,
      auditEventId: 'audit_access_denied_permission_001',
    }),
    /not authorized to manage_sessions/,
  );

  const auditEvents = await service.listAuditEvents();
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].decision, 'denied');
  assert.equal(auditEvents[0].action, 'session.create');
  assert.equal(auditEvents[0].metadata.relationship, 'parent_guardian');
});


test('access-controlled service records denied audits for revoked or mismatched consent', async () => {
  const service = createAccessControlledSessionService({
    sessionService: createSessionPersistenceService({ now: fixedNow }),
    now: fixedNow,
  });
  const revokedContext = createGuardianContext({ consentId: 'consent_access_revoked_001' });
  const revokedConsent = revokeConsent(revokedContext.consentRecord, {
    revokedAt: '2026-05-29T00:30:00.000Z',
    reason: 'guardian_request',
  });

  await assert.rejects(
    () => service.saveSession(createMathSession('ses_access_revoked_001'), {
      ...revokedContext,
      consentRecord: revokedConsent,
      auditEventId: 'audit_access_denied_revoked_001',
    }),
    /active consent is required/,
  );

  await assert.rejects(
    () => service.saveSession(createMathSession('ses_access_mismatch_001'), {
      ...createGuardianContext({ consentLearnerId: 'learner_other_001' }),
      auditEventId: 'audit_access_denied_mismatch_001',
    }),
    /does not match session learner/,
  );

  const deniedEvents = await service.listAuditEvents({ decision: 'denied' });
  assert.deepEqual(deniedEvents.map((event) => event.reason), [
    'active consent is required for progress_tracking',
    'consent learner learner_other_001 does not match session learner learner_access_001',
  ]);
});



test('access-controlled service lists active sessions and deletion tombstones with audit coverage', async () => {
  const service = createAccessControlledSessionService({
    sessionService: createSessionPersistenceService({ now: fixedNow }),
    now: fixedNow,
  });
  const context = createGuardianContext();
  await service.saveSession(createMathSession('ses_access_list_active_001'), {
    ...context,
    auditEventId: 'audit_access_list_save_active_001',
  });
  await service.saveSession(createMathSession('ses_access_list_deleted_001'), {
    ...context,
    auditEventId: 'audit_access_list_save_deleted_001',
  });
  await service.deleteSessionRecord('ses_access_list_deleted_001', {
    ...context,
    auditEventId: 'audit_access_list_delete_001',
  });

  const activeRecords = await service.listSessionRecords({
    ...context,
    auditEventId: 'audit_access_list_active_001',
  });
  const tombstones = await service.listDeletedSessionTombstones({
    ...context,
    auditEventId: 'audit_access_list_tombstones_001',
  });
  const tombstone = await service.loadDeletedSessionTombstone('ses_access_list_deleted_001', {
    ...context,
    auditEventId: 'audit_access_read_tombstone_001',
  });

  assert.deepEqual(activeRecords.map((record) => record.sessionId), ['ses_access_list_active_001']);
  assert.deepEqual(tombstones.map((entry) => entry.sessionId), ['ses_access_list_deleted_001']);
  assert.equal(tombstone.sessionId, 'ses_access_list_deleted_001');

  const auditEvents = await service.listAuditEvents({ decision: 'allowed' });
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'session.create',
    'session.create',
    'session.delete',
    'session.list',
    'session.tombstone.list',
    'session.tombstone.read',
  ]);
});

test('access-controlled service exports session data with data_export consent and inventory classifications', async () => {
  const service = createAccessControlledSessionService({
    sessionService: createSessionPersistenceService({ now: fixedNow }),
    now: fixedNow,
  });
  const context = createGuardianContext();
  await service.saveSession(createMathSession('ses_access_export_001'), {
    ...context,
    auditEventId: 'audit_access_export_save_001',
  });
  const exportPacket = await service.exportSessionRecord('ses_access_export_001', {
    ...context,
    auditEventId: 'audit_access_export_allowed_001',
  });

  assert.equal(exportPacket.mode, 'session_data_export');
  assert.equal(exportPacket.sessionId, 'ses_access_export_001');
  assert.equal(exportPacket.exportedByAccountId, context.account.id);
  assert.equal(exportPacket.records.sessionRecord.sessionId, 'ses_access_export_001');
  assert.ok(exportPacket.dataInventory.some((record) => record.contractName === 'session-record'));
  assert.ok(exportPacket.dataInventory.every((record) => record.realDataAllowed === false));
  assert.equal(exportPacket.metadata.retentionDisposition.status, 'active');
  assert.equal(exportPacket.metadata.retentionDisposition.policyId, retentionPolicy.id);

  const auditEvents = await service.listAuditEvents();
  assert.deepEqual(auditEvents.map((event) => event.action), ['session.create', 'data.export']);
  assert.equal(auditEvents[1].permission, 'export_data');
  assert.equal(auditEvents[1].consentScope, 'data_export');
});

test('access-controlled service denies data exports without data_export consent', async () => {
  const service = createAccessControlledSessionService({
    sessionService: createSessionPersistenceService({ now: fixedNow }),
    now: fixedNow,
  });
  const context = createGuardianContext();
  await service.saveSession(createMathSession('ses_access_export_denied_001'), {
    ...context,
    auditEventId: 'audit_access_export_denied_save_001',
  });

  await assert.rejects(
    () => service.exportSessionRecord('ses_access_export_denied_001', {
      ...createGuardianContext({ grantedScopes: ['progress_tracking'] }),
      auditEventId: 'audit_access_export_denied_001',
    }),
    /active consent is required for data_export/,
  );

  const deniedEvents = await service.listAuditEvents({ decision: 'denied' });
  assert.equal(deniedEvents.length, 1);
  assert.equal(deniedEvents[0].action, 'data.export');
  assert.equal(deniedEvents[0].permission, 'export_data');
});


test('access-controlled service blocks export when retention has expired and records audit before denial', async () => {
  const service = createAccessControlledSessionService({
    sessionService: createSessionPersistenceService({ now: fixedNow }),
    now: () => '2027-06-01T00:00:00.000Z',
  });
  const context = createGuardianContext({
    retentionPolicy: {
      ...retentionPolicy,
      id: 'retention.us.session.expired-access-test',
      retentionDays: 0,
    },
  });
  await service.saveSession(createMathSession('ses_access_retention_expired_001'), {
    ...context,
    auditEventId: 'audit_access_retention_save_001',
  });

  await assert.rejects(
    () => service.exportSessionRecord('ses_access_retention_expired_001', {
      ...context,
      auditEventId: 'audit_access_retention_export_001',
    }),
    /retention expired/,
  );

  const auditEvents = await service.listAuditEvents();
  assert.deepEqual(auditEvents.map((event) => event.action), ['session.create', 'data.export']);
  assert.equal(auditEvents[1].decision, 'denied');
});

test('access-controlled service enforces delete_data for session deletion', async () => {
  const service = createAccessControlledSessionService({
    sessionService: createSessionPersistenceService({ now: fixedNow }),
    now: fixedNow,
  });
  const context = createGuardianContext();
  await service.saveSession(createMathSession('ses_access_delete_001'), {
    ...context,
    auditEventId: 'audit_access_delete_save_001',
  });
  const result = await service.deleteSessionRecord('ses_access_delete_001', {
    ...context,
    auditEventId: 'audit_access_delete_allowed_001',
  });

  assert.equal(result.deleted, true);
  assert.equal(result.sessionId, 'ses_access_delete_001');
  assert.equal(result.tombstone.sessionId, 'ses_access_delete_001');
  assert.equal(result.tombstone.deletedByAccountId, context.account.id);
  assert.equal(result.tombstone.retentionDisposition.status, 'active');
  assert.equal(await service.loadSessionRecord('ses_access_delete_001', context), null);
  const auditEvents = await service.listAuditEvents();
  assert.deepEqual(auditEvents.map((event) => event.action), ['session.create', 'session.delete']);
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
