import { execFile } from 'node:child_process';
import { copyFile, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const schemaUrl = new URL('../../db/session-adapter.sql', import.meta.url);

export function createSqliteSessionRecordStore({
  databasePath,
  sqliteCommand = 'sqlite3',
  initialize = true,
  now = () => new Date().toISOString(),
} = {}) {
  assertNonEmptyString(databasePath, 'databasePath');
  assertNonEmptyString(sqliteCommand, 'sqliteCommand');
  if (typeof now !== 'function') {
    throw new TypeError('now must be a function');
  }

  const ready = initialize
    ? initializeSqliteSessionDatabase({ databasePath, sqliteCommand })
    : Promise.resolve();

  return Object.freeze({
    async saveRecord(record) {
      await ready;
      assertSessionRecord(record);
      const recordVersion = getRecordVersion(record);
      await executeSql(sqliteCommand, databasePath, buildSaveRecordTransaction(record, recordVersion));
    },
    async loadRecord(sessionId) {
      await ready;
      assertNonEmptyString(sessionId, 'sessionId');
      const rows = await querySql(sqliteCommand, databasePath, `
        SELECT record_json
        FROM session_records
        WHERE session_id = ${sqlString(sessionId)} AND deleted_at IS NULL
        LIMIT 1;
      `);
      return rows[0] ? freezeJson(JSON.parse(rows[0].record_json)) : null;
    },
    async listRecords() {
      await ready;
      const rows = await querySql(sqliteCommand, databasePath, `
        SELECT record_json
        FROM session_records
        WHERE deleted_at IS NULL
        ORDER BY updated_at, session_id;
      `);
      return Object.freeze(rows.map((row) => freezeJson(JSON.parse(row.record_json))));
    },
    async deleteRecord(sessionId, options = {}) {
      await ready;
      assertNonEmptyString(sessionId, 'sessionId');
      const rows = await querySql(sqliteCommand, databasePath, `
        SELECT record_version
        FROM session_records
        WHERE session_id = ${sqlString(sessionId)} AND deleted_at IS NULL
        LIMIT 1;
      `);
      if (rows.length === 0) return;
      const nextRecordVersion = Number(rows[0].record_version) + 1;
      await executeSql(sqliteCommand, databasePath, buildDeleteRecordTransaction({
        sessionId,
        recordVersion: nextRecordVersion,
        deletedAt: now(),
        tombstone: options.tombstone ?? null,
      }));
    },
    async loadTombstone(sessionId) {
      await ready;
      assertNonEmptyString(sessionId, 'sessionId');
      const rows = await querySql(sqliteCommand, databasePath, `
        SELECT record_json
        FROM session_record_events
        WHERE session_id = ${sqlString(sessionId)} AND type = 'delete' AND record_json IS NOT NULL
        ORDER BY record_version DESC
        LIMIT 1;
      `);
      return rows[0] ? freezeJson(JSON.parse(rows[0].record_json)) : null;
    },
    async listTombstones() {
      await ready;
      const rows = await querySql(sqliteCommand, databasePath, `
        SELECT record_json
        FROM session_record_events
        WHERE type = 'delete' AND record_json IS NOT NULL
        ORDER BY occurred_at, session_id;
      `);
      return Object.freeze(rows.map((row) => freezeJson(JSON.parse(row.record_json))));
    },
  });
}

export function createSqliteAuditEventStore({
  databasePath,
  sqliteCommand = 'sqlite3',
  initialize = true,
} = {}) {
  assertNonEmptyString(databasePath, 'databasePath');
  assertNonEmptyString(sqliteCommand, 'sqliteCommand');

  const ready = initialize
    ? initializeSqliteSessionDatabase({ databasePath, sqliteCommand })
    : Promise.resolve();

  return Object.freeze({
    async saveAuditEvent(auditEvent) {
      await ready;
      assertAuditEvent(auditEvent);
      const frozenEvent = freezeJson(auditEvent);
      await executeSql(sqliteCommand, databasePath, buildSaveAuditEventStatement(frozenEvent));
      return frozenEvent;
    },
    async listAuditEvents() {
      await ready;
      const rows = await querySql(sqliteCommand, databasePath, `
        SELECT metadata_json
        FROM audit_events
        ORDER BY occurred_at, audit_event_id;
      `);
      return Object.freeze(rows.map((row) => freezeJson(JSON.parse(row.metadata_json))));
    },
    async clearAuditEvents() {
      await ready;
      await executeSql(sqliteCommand, databasePath, 'DELETE FROM audit_events;');
    },
  });
}

export async function initializeSqliteSessionDatabase({ databasePath, sqliteCommand = 'sqlite3' } = {}) {
  assertNonEmptyString(databasePath, 'databasePath');
  assertNonEmptyString(sqliteCommand, 'sqliteCommand');
  const schema = await readFile(schemaUrl, 'utf8');
  await executeSql(sqliteCommand, databasePath, makeSchemaIdempotent(schema));
}

export async function exportSqliteRetentionRecords({
  databasePath,
  sqliteCommand = 'sqlite3',
  includeDeleted = false,
} = {}) {
  assertNonEmptyString(databasePath, 'databasePath');
  assertNonEmptyString(sqliteCommand, 'sqliteCommand');
  if (typeof includeDeleted !== 'boolean') {
    throw new TypeError('includeDeleted must be a boolean');
  }

  const rows = await querySql(sqliteCommand, databasePath, `
    SELECT session_id, record_version, updated_at, deleted_at, record_json
    FROM session_records
    WHERE ${includeDeleted ? '1 = 1' : 'deleted_at IS NULL'}
    ORDER BY updated_at, session_id;
  `);

  return Object.freeze(rows.map((row) => freezeJson({
    sessionId: row.session_id,
    recordVersion: Number(row.record_version),
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
    record: row.record_json ? JSON.parse(row.record_json) : null,
  })));
}

export async function backupSqliteSessionDatabase({
  databasePath,
  backupPath,
  sqliteCommand = 'sqlite3',
} = {}) {
  assertNonEmptyString(databasePath, 'databasePath');
  assertNonEmptyString(backupPath, 'backupPath');
  assertNonEmptyString(sqliteCommand, 'sqliteCommand');
  await executeSql(sqliteCommand, databasePath, `VACUUM INTO ${sqlString(backupPath)};`);
  return backupPath;
}

export async function restoreSqliteSessionDatabase({ backupPath, restorePath } = {}) {
  assertNonEmptyString(backupPath, 'backupPath');
  assertNonEmptyString(restorePath, 'restorePath');
  await copyFile(backupPath, restorePath);
  return restorePath;
}

function buildSaveRecordTransaction(record, recordVersion) {
  const recordJson = JSON.stringify(record);
  const traceId = record.metadata?.traceId ?? `trace_${safeSqlId(record.sessionId)}_${recordVersion}`;
  const actorAccountId = record.metadata?.actorAccountId ?? null;
  const statements = [
    'PRAGMA foreign_keys = ON',
    'BEGIN IMMEDIATE',
    `INSERT INTO session_records (
      session_id,
      learner_id,
      subject,
      problem_id,
      workspace_kind,
      record_version,
      etag,
      updated_at,
      record_json,
      deleted_at
    ) VALUES (
      ${sqlString(record.sessionId)},
      ${sqlString(record.learnerId)},
      ${sqlString(record.subject)},
      ${sqlString(record.problemId)},
      ${sqlString(record.workspaceKind)},
      ${sqlInteger(recordVersion)},
      ${sqlString(record.metadata.etag)},
      ${sqlString(record.updatedAt)},
      ${sqlString(recordJson)},
      NULL
    ) ON CONFLICT(session_id) DO UPDATE SET
      learner_id = excluded.learner_id,
      subject = excluded.subject,
      problem_id = excluded.problem_id,
      workspace_kind = excluded.workspace_kind,
      record_version = excluded.record_version,
      etag = excluded.etag,
      updated_at = excluded.updated_at,
      record_json = excluded.record_json,
      deleted_at = NULL`,
    `INSERT OR IGNORE INTO session_record_events (
      event_id,
      session_id,
      type,
      record_version,
      occurred_at,
      record_json,
      actor_account_id,
      trace_id
    ) VALUES (
      ${sqlString(`${record.sessionId}:upsert:${recordVersion}`)},
      ${sqlString(record.sessionId)},
      'upsert',
      ${sqlInteger(recordVersion)},
      ${sqlString(record.updatedAt)},
      ${sqlString(recordJson)},
      ${sqlString(actorAccountId)},
      ${sqlString(traceId)}
    )`,
    ...buildSnapshotInsertStatements(record, recordVersion),
    ...buildInteractionEventInsertStatements(record),
    'COMMIT',
  ];
  return `${statements.join(';\n')};`;
}

function buildDeleteRecordTransaction({ sessionId, recordVersion, deletedAt, tombstone = null }) {
  const traceId = tombstone?.traceId ?? `trace_${safeSqlId(sessionId)}_${recordVersion}`;
  const actorAccountId = tombstone?.deletedByAccountId ?? null;
  const statements = [
    'PRAGMA foreign_keys = ON',
    'BEGIN IMMEDIATE',
    `UPDATE session_records
      SET deleted_at = ${sqlString(deletedAt)},
          record_version = ${sqlInteger(recordVersion)},
          updated_at = ${sqlString(deletedAt)}
      WHERE session_id = ${sqlString(sessionId)} AND deleted_at IS NULL`,
    `INSERT OR IGNORE INTO session_record_events (
      event_id,
      session_id,
      type,
      record_version,
      occurred_at,
      record_json,
      actor_account_id,
      trace_id
    ) VALUES (
      ${sqlString(`${sessionId}:delete:${recordVersion}`)},
      ${sqlString(sessionId)},
      'delete',
      ${sqlInteger(recordVersion)},
      ${sqlString(deletedAt)},
      ${sqlString(tombstone ? JSON.stringify(tombstone) : null)},
      ${sqlString(actorAccountId)},
      ${sqlString(traceId)}
    )`,
    'COMMIT',
  ];
  return `${statements.join(';\n')};`;
}

function buildSnapshotInsertStatements(record, recordVersion) {
  const snapshots = Array.isArray(record.snapshotHistory) ? record.snapshotHistory : [];
  return snapshots.map((snapshot, index) => {
    const snapshotId = snapshot.id ?? `${record.sessionId}:snapshot:${snapshot.version ?? recordVersion}:${index + 1}`;
    return `INSERT OR IGNORE INTO workspace_snapshots (
      snapshot_id,
      session_id,
      record_version,
      created_at,
      snapshot_json
    ) VALUES (
      ${sqlString(snapshotId)},
      ${sqlString(record.sessionId)},
      ${sqlInteger(recordVersion)},
      ${sqlString(snapshot.updatedAt ?? record.updatedAt)},
      ${sqlString(JSON.stringify(snapshot))}
    )`;
  });
}

function buildInteractionEventInsertStatements(record) {
  const events = Array.isArray(record.events) ? record.events : [];
  return events.map((event, index) => {
    const eventId = event.id ?? `${record.sessionId}:interaction:${index + 1}`;
    return `INSERT OR IGNORE INTO interaction_events (
      interaction_event_id,
      session_id,
      learner_id,
      problem_id,
      type,
      modality,
      occurred_at,
      payload_json
    ) VALUES (
      ${sqlString(eventId)},
      ${sqlString(record.sessionId)},
      ${sqlString(event.learnerId ?? record.learnerId ?? null)},
      ${sqlString(event.problemId ?? record.problemId)},
      ${sqlString(event.type ?? 'unknown')},
      ${sqlString(event.modality ?? 'unknown')},
      ${sqlString(event.occurredAt ?? record.updatedAt)},
      ${sqlString(JSON.stringify(event.payload ?? {}))}
    )`;
  });
}

function buildSaveAuditEventStatement(auditEvent) {
  return `INSERT OR IGNORE INTO audit_events (
    audit_event_id,
    learner_id,
    actor_account_id,
    action,
    decision,
    occurred_at,
    trace_id,
    metadata_json
  ) VALUES (
    ${sqlString(auditEvent.id)},
    ${sqlString(auditEvent.learnerId)},
    ${sqlString(auditEvent.actorAccountId)},
    ${sqlString(auditEvent.action)},
    ${sqlString(auditEvent.decision)},
    ${sqlString(auditEvent.occurredAt)},
    ${sqlString(auditEvent.traceId)},
    ${sqlString(JSON.stringify(auditEvent))}
  );`;
}

async function querySql(sqliteCommand, databasePath, sql) {
  const { stdout } = await execFileAsync(sqliteCommand, ['-json', '--', databasePath, sql], { maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout.trim() || '[]');
}

async function executeSql(sqliteCommand, databasePath, sql) {
  await execFileAsync(sqliteCommand, ['--', databasePath, sql], { maxBuffer: 10 * 1024 * 1024 });
}

function makeSchemaIdempotent(schema) {
  return schema
    .replaceAll(/CREATE TABLE\s+/g, 'CREATE TABLE IF NOT EXISTS ')
    .replaceAll(/CREATE INDEX\s+/g, 'CREATE INDEX IF NOT EXISTS ');
}

function assertSessionRecord(record) {
  assertPlainObject(record, 'record');
  assertNonEmptyString(record.sessionId, 'record.sessionId');
  assertNonEmptyString(record.learnerId, 'record.learnerId');
  assertNonEmptyString(record.subject, 'record.subject');
  assertNonEmptyString(record.problemId, 'record.problemId');
  assertNonEmptyString(record.workspaceKind, 'record.workspaceKind');
  assertNonEmptyString(record.updatedAt, 'record.updatedAt');
  assertPlainObject(record.metadata, 'record.metadata');
  assertNonEmptyString(record.metadata.etag, 'record.metadata.etag');
  getRecordVersion(record);
}

function assertAuditEvent(auditEvent) {
  assertPlainObject(auditEvent, 'auditEvent');
  assertNonEmptyString(auditEvent.id, 'auditEvent.id');
  assertNonEmptyString(auditEvent.action, 'auditEvent.action');
  assertNonEmptyString(auditEvent.decision, 'auditEvent.decision');
  assertNonEmptyString(auditEvent.occurredAt, 'auditEvent.occurredAt');
  assertNonEmptyString(auditEvent.traceId, 'auditEvent.traceId');
  assertPlainObject(auditEvent.metadata, 'auditEvent.metadata');
}

function getRecordVersion(record) {
  const version = record?.metadata?.recordVersion;
  if (!Number.isInteger(version) || version < 0) {
    throw new TypeError('record.metadata.recordVersion must be a non-negative integer');
  }
  return version;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlInteger(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`expected integer SQL value, received ${value}`);
  }
  return String(value);
}

function safeSqlId(value) {
  return String(value).replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
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
