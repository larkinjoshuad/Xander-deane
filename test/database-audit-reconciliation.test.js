import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { createConsentRecord, revokeConsent } from '../src/app/consent-safety.js';
import {
  backupSqliteSessionDatabase,
  createSqliteAuditEventStore,
  createSqliteSessionRecordStore,
  exportSqliteRetentionRecords,
  initializeSqliteSessionDatabase,
  restoreSqliteSessionDatabase,
} from '../src/app/database-session-record-store.js';
import { createAccount, createLearnerAccountLink } from '../src/app/identity-access.js';
import {
  createInitialLearningSession,
  placeSelectedCounter,
  selectCounter,
} from '../src/app/learning-session.js';
import { createAccessControlledSessionService } from '../src/app/session-access-service.js';
import { createSessionPersistenceService } from '../src/app/session-service.js';

const execFileAsync = promisify(execFile);
const hasSqlite = await execFileAsync('sqlite3', ['-version']).then(() => true, () => false);
const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const fixedNow = () => '2026-05-30T00:00:00.000Z';

test('SQLite session and audit stores reconcile writes, deletes, and denials', { skip: !hasSqlite }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-db-audit-reconcile-'));
  const databasePath = join(directory, 'session-audit.sqlite');
  try {
    await initializeSqliteSessionDatabase({ databasePath });
    const sessionService = createSessionPersistenceService({
      recordStore: createSqliteSessionRecordStore({ databasePath, initialize: false, now: fixedNow }),
      now: fixedNow,
    });
    const auditEventStore = createSqliteAuditEventStore({ databasePath, initialize: false });
    const service = createAccessControlledSessionService({
      sessionService,
      auditEventStore,
      now: fixedNow,
    });
    const context = createGuardianContext();
    let session = createMathSession('ses_db_audit_001');

    let record = await service.saveSession(session, {
      ...context,
      auditEventId: 'audit_db_session_create_allowed_001',
    });
    session = placeSelectedCounter(selectCounter(session, 'counter_1'), 'group_1', fixedNow);
    record = await service.appendInteractionEvent(session.sessionId, session.events.at(-1), {
      ...context,
      expectedRecordVersion: record.metadata.recordVersion,
      auditEventId: 'audit_db_event_append_allowed_001',
    });
    record = await service.appendWorkspaceSnapshot(session.sessionId, session.workspaceSnapshot, {
      ...context,
      expectedRecordVersion: record.metadata.recordVersion,
      auditEventId: 'audit_db_snapshot_append_allowed_001',
    });
    await service.deleteSessionRecord(session.sessionId, {
      ...context,
      expectedRecordVersion: record.metadata.recordVersion,
      auditEventId: 'audit_db_session_delete_allowed_001',
    });

    await assert.rejects(
      () => service.saveSession(createMathSession('ses_db_audit_denied_001'), {
        ...createGuardianContext({ permissions: ['view_progress'] }),
        auditEventId: 'audit_db_session_create_denied_001',
      }),
      /not authorized to manage_sessions/,
    );
    const revokedContext = createGuardianContext({ consentId: 'consent_db_audit_revoked_001' });
    await assert.rejects(
      () => service.saveSession(createMathSession('ses_db_audit_revoked_001'), {
        ...revokedContext,
        consentRecord: revokeConsent(revokedContext.consentRecord, {
          revokedAt: fixedNow(),
          reason: 'guardian_request',
        }),
        auditEventId: 'audit_db_session_create_denied_revoked_001',
      }),
      /active consent is required for progress_tracking/,
    );
    await assert.rejects(
      () => service.saveSession(createMathSession('ses_db_audit_wrong_learner_001'), {
        ...createGuardianContext({
          accountId: 'guardian_db_audit_other_001',
          linkId: 'link_db_audit_other_001',
          learnerId: 'learner_db_audit_other_001',
          consentId: 'consent_db_audit_other_001',
        }),
        auditEventId: 'audit_db_session_create_denied_owner_001',
      }),
      /not authorized to manage_sessions/,
    );

    const auditEvents = await service.listAuditEvents();
    assert.deepEqual(auditEvents.map((event) => event.id).sort(), [
      'audit_db_event_append_allowed_001',
      'audit_db_session_create_allowed_001',
      'audit_db_session_create_denied_001',
      'audit_db_session_create_denied_owner_001',
      'audit_db_session_create_denied_revoked_001',
      'audit_db_session_delete_allowed_001',
      'audit_db_snapshot_append_allowed_001',
    ]);
    assert.deepEqual(countBy(auditEvents, 'action'), {
      'event.append': 1,
      'session.create': 4,
      'session.delete': 1,
      'snapshot.append': 1,
    });
    assert.deepEqual(countBy(auditEvents, 'decision'), { allowed: 4, denied: 3 });
    assert.equal(await scalar(databasePath, 'SELECT COUNT(*) AS count FROM audit_events'), 7);
    assert.equal(await scalar(databasePath, 'SELECT COUNT(*) AS count FROM session_record_events'), 4);
    assert.equal(await scalar(databasePath, 'SELECT COUNT(*) AS count FROM session_record_events WHERE type = \'delete\''), 1);
    assert.equal(await scalar(databasePath, 'SELECT COUNT(*) AS count FROM session_records WHERE deleted_at IS NOT NULL'), 1);
    assert.equal(await scalar(databasePath, `SELECT COUNT(*) AS count FROM session_records WHERE session_id IN (
      'ses_db_audit_denied_001',
      'ses_db_audit_revoked_001',
      'ses_db_audit_wrong_learner_001'
    )`), 0);

    const persistedAuditEvents = await createSqliteAuditEventStore({ databasePath, initialize: false }).listAuditEvents();
    assert.deepEqual(persistedAuditEvents, auditEvents);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('SQLite retention export and backup restore preserve active and tombstoned records', { skip: !hasSqlite }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-db-retention-'));
  const databasePath = join(directory, 'session-retention.sqlite');
  const backupPath = join(directory, 'session-retention.backup.sqlite');
  const restorePath = join(directory, 'session-retention.restore.sqlite');
  try {
    await initializeSqliteSessionDatabase({ databasePath });
    const sessionService = createSessionPersistenceService({
      recordStore: createSqliteSessionRecordStore({ databasePath, initialize: false, now: fixedNow }),
      now: fixedNow,
    });

    const deletedRecord = await sessionService.saveSession(createMathSession('ses_db_export_deleted_001'));
    await sessionService.deleteSessionRecord('ses_db_export_deleted_001', {
      expectedRecordVersion: deletedRecord.metadata.recordVersion,
    });
    const activeRecord = await sessionService.saveSession(createMathSession('ses_db_export_active_001'));

    const activeExports = await exportSqliteRetentionRecords({ databasePath });
    assert.deepEqual(activeExports.map((entry) => entry.sessionId), ['ses_db_export_active_001']);
    assert.equal(activeExports[0].record.metadata.etag, activeRecord.metadata.etag);

    const allExports = await exportSqliteRetentionRecords({ databasePath, includeDeleted: true });
    assert.deepEqual(allExports.map((entry) => entry.sessionId).sort(), [
      'ses_db_export_active_001',
      'ses_db_export_deleted_001',
    ]);
    assert.equal(allExports.find((entry) => entry.sessionId === 'ses_db_export_deleted_001').deletedAt, fixedNow());

    await backupSqliteSessionDatabase({ databasePath, backupPath });
    await restoreSqliteSessionDatabase({ backupPath, restorePath });

    const restoredStore = createSqliteSessionRecordStore({ databasePath: restorePath, initialize: false, now: fixedNow });
    assert.equal(await restoredStore.loadRecord('ses_db_export_deleted_001'), null);
    assert.equal((await restoredStore.loadRecord('ses_db_export_active_001')).metadata.etag, activeRecord.metadata.etag);
    assert.deepEqual(await exportSqliteRetentionRecords({ databasePath: restorePath, includeDeleted: true }), allExports);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function createMathSession(sessionId) {
  return createInitialLearningSession({
    sessionId,
    learnerId: 'learner_db_audit_001',
    objective,
    problem,
    now: fixedNow,
  });
}

function createGuardianContext(overrides = {}) {
  const account = createAccount({
    id: overrides.accountId ?? 'guardian_db_audit_001',
    role: 'guardian',
    displayName: 'Database Audit Guardian',
    createdAt: fixedNow(),
  });
  const link = createLearnerAccountLink({
    id: overrides.linkId ?? 'link_db_audit_guardian_001',
    accountId: account.id,
    learnerId: overrides.learnerId ?? 'learner_db_audit_001',
    relationship: 'parent_guardian',
    permissions: overrides.permissions,
    createdAt: fixedNow(),
  });
  const consentRecord = createConsentRecord({
    id: overrides.consentId ?? 'consent_db_audit_001',
    learnerId: link.learnerId,
    guardianId: account.id,
    grantedScopes: overrides.grantedScopes ?? ['progress_tracking', 'personalization', 'data_export'],
    collectedAt: fixedNow(),
  });

  return {
    account,
    link,
    consentRecord,
    traceId: overrides.traceId ?? 'trace_db_audit_001',
  };
}

async function scalar(databasePath, sql) {
  const { stdout } = await execFileAsync('sqlite3', ['-json', '--', databasePath, sql]);
  return JSON.parse(stdout)[0].count;
}

function countBy(records, fieldName) {
  return records.reduce((counts, record) => {
    counts[record[fieldName]] = (counts[record[fieldName]] ?? 0) + 1;
    return counts;
  }, {});
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
