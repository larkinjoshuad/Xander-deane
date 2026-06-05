import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertConsentAllows } from './consent-safety.js';
import { createLearnerAccessAuditEvent } from './audit-log.js';
import { createSessionDataExport } from './data-rights.js';
import {
  assertExportAllowedByRetention,
  createDeletionTombstone,
  evaluateRetentionDisposition,
  resolveRetentionPolicy,
} from './data-retention.js';
import { canAccessLearner } from './identity-access.js';
import { createSessionPersistenceService } from './session-service.js';

const DEFAULT_SESSION_CONSENT_SCOPE = 'progress_tracking';

export function createAccessControlledSessionService({
  sessionService = createSessionPersistenceService(),
  auditEventStore = createInMemoryAuditEventStore(),
  now = () => new Date().toISOString(),
  retentionPolicy = null,
} = {}) {
  assertService(sessionService, 'sessionService');
  assertService(auditEventStore, 'auditEventStore');
  assertFunction(now, 'now');
  const defaultRetentionPolicy = resolveRetentionPolicy(retentionPolicy);

  return Object.freeze({
    async saveSession(session, context) {
      const learnerId = requireLearnerId(session.learnerId, 'session.learnerId');
      return authorizeAndAudit({
        auditEventStore,
        now,
        context,
        learnerId,
        action: 'session.create',
        resourceType: 'session',
        resourceId: session.sessionId,
        permission: 'manage_sessions',
        consentScope: DEFAULT_SESSION_CONSENT_SCOPE,
        allowedReason: 'session save allowed by learner link and consent',
        operation: () => sessionService.saveSession(session, {
          consentRecord: context.consentRecord,
          expectedRecordVersion: context.expectedRecordVersion,
        }),
      });
    },
    async loadSessionRecord(sessionId, context) {
      assertNonEmptyString(sessionId, 'sessionId');
      const record = await sessionService.loadSessionRecord(sessionId);
      if (record === null) return null;
      const learnerId = requireLearnerId(record.learnerId, 'record.learnerId');
      return authorizeAndAudit({
        auditEventStore,
        now,
        context,
        learnerId,
        action: 'session.read',
        resourceType: 'session',
        resourceId: sessionId,
        permission: 'manage_sessions',
        consentScope: null,
        allowedReason: 'session read allowed by learner link',
        operation: () => record,
      });
    },
    async listSessionRecords(context, filter = {}) {
      assertPlainObject(filter, 'filter');
      const learnerId = requireLearnerId(filter.learnerId ?? context?.link?.learnerId, 'filter.learnerId');
      return authorizeAndAudit({
        auditEventStore,
        now,
        context,
        learnerId,
        action: 'session.list',
        resourceType: 'session_collection',
        resourceId: learnerId,
        permission: 'manage_sessions',
        consentScope: null,
        allowedReason: 'session list allowed by learner link',
        operation: () => sessionService.listSessionRecords({ ...filter, learnerId }),
      });
    },
    async loadDeletedSessionTombstone(sessionId, context) {
      assertNonEmptyString(sessionId, 'sessionId');
      const tombstone = await sessionService.loadDeletedSessionTombstone(sessionId);
      if (tombstone === null) return null;
      const learnerId = requireLearnerId(tombstone.learnerId, 'tombstone.learnerId');
      return authorizeAndAudit({
        auditEventStore,
        now,
        context,
        learnerId,
        action: 'session.tombstone.read',
        resourceType: 'session_tombstone',
        resourceId: sessionId,
        permission: 'manage_sessions',
        consentScope: null,
        allowedReason: 'session tombstone read allowed by learner link',
        operation: () => tombstone,
      });
    },
    async listDeletedSessionTombstones(context, filter = {}) {
      assertPlainObject(filter, 'filter');
      const learnerId = requireLearnerId(filter.learnerId ?? context?.link?.learnerId, 'filter.learnerId');
      return authorizeAndAudit({
        auditEventStore,
        now,
        context,
        learnerId,
        action: 'session.tombstone.list',
        resourceType: 'session_tombstone_collection',
        resourceId: learnerId,
        permission: 'manage_sessions',
        consentScope: null,
        allowedReason: 'session tombstone list allowed by learner link',
        operation: () => sessionService.listDeletedSessionTombstones({ ...filter, learnerId }),
      });
    },
    async appendInteractionEvent(sessionId, event, context) {
      assertNonEmptyString(sessionId, 'sessionId');
      assertPlainObject(event, 'event');
      const record = await requireSessionRecord(sessionService, sessionId);
      const learnerId = requireLearnerId(record.learnerId, 'record.learnerId');
      return authorizeAndAudit({
        auditEventStore,
        now,
        context,
        learnerId,
        action: 'event.append',
        resourceType: 'interaction_event',
        resourceId: event.id,
        permission: 'manage_sessions',
        consentScope: DEFAULT_SESSION_CONSENT_SCOPE,
        allowedReason: 'interaction event append allowed by learner link and consent',
        operation: () => sessionService.appendInteractionEvent(sessionId, event, {
          consentRecord: context.consentRecord,
          expectedRecordVersion: context.expectedRecordVersion,
        }),
      });
    },
    async appendWorkspaceSnapshot(sessionId, workspaceSnapshot, context) {
      assertNonEmptyString(sessionId, 'sessionId');
      assertPlainObject(workspaceSnapshot, 'workspaceSnapshot');
      const record = await requireSessionRecord(sessionService, sessionId);
      const learnerId = requireLearnerId(record.learnerId, 'record.learnerId');
      return authorizeAndAudit({
        auditEventStore,
        now,
        context,
        learnerId,
        action: 'snapshot.append',
        resourceType: 'workspace_snapshot',
        resourceId: workspaceSnapshot.id,
        permission: 'manage_sessions',
        consentScope: DEFAULT_SESSION_CONSENT_SCOPE,
        allowedReason: 'workspace snapshot append allowed by learner link and consent',
        operation: () => sessionService.appendWorkspaceSnapshot(sessionId, workspaceSnapshot, {
          consentRecord: context.consentRecord,
          expectedRecordVersion: context.expectedRecordVersion,
        }),
      });
    },
    async exportSessionRecord(sessionId, context) {
      assertNonEmptyString(sessionId, 'sessionId');
      const record = await requireSessionRecord(sessionService, sessionId);
      const learnerId = requireLearnerId(record.learnerId, 'record.learnerId');
      let retentionDisposition = null;
      return authorizeAndAudit({
        auditEventStore,
        now,
        context,
        learnerId,
        action: 'data.export',
        resourceType: 'session',
        resourceId: sessionId,
        permission: 'export_data',
        consentScope: 'data_export',
        allowedReason: 'session export allowed by learner link, consent, and retention policy',
        policyCheck: ({ checkedAt }) => {
          retentionDisposition = evaluateSessionRetention({
            record,
            context,
            defaultRetentionPolicy,
            evaluatedAt: checkedAt,
          });
          if (retentionDisposition) {
            assertExportAllowedByRetention(retentionDisposition);
          }
        },
        operation: () => createSessionDataExport({
          sessionRecord: record,
          inventoryRecords: context.dataInventory?.records ?? [],
          exportedAt: retentionDisposition?.evaluatedAt ?? now(),
          exportedByAccountId: context.account.id,
          traceId: context.traceId ?? null,
          retentionDisposition,
        }),
      });
    },
    async deleteSessionRecord(sessionId, context) {
      assertNonEmptyString(sessionId, 'sessionId');
      const record = await requireSessionRecord(sessionService, sessionId);
      const learnerId = requireLearnerId(record.learnerId, 'record.learnerId');
      return authorizeAndAudit({
        auditEventStore,
        now,
        context,
        learnerId,
        action: 'session.delete',
        resourceType: 'session',
        resourceId: sessionId,
        permission: 'delete_data',
        consentScope: null,
        allowedReason: 'session delete allowed by learner link',
        operation: async () => {
          const deletedAt = now();
          const retentionDisposition = evaluateSessionRetention({
            record,
            context,
            defaultRetentionPolicy,
            evaluatedAt: deletedAt,
          });
          const tombstone = createDeletionTombstone({
            sessionRecord: record,
            retentionDisposition,
            deletedAt,
            deletedByAccountId: context.account.id,
            traceId: context.traceId ?? null,
            reason: retentionDisposition?.deletionRecommended
              ? retentionDisposition.reason
              : 'authorized data deletion request',
          });
          await sessionService.deleteSessionRecord(sessionId, {
            expectedRecordVersion: context.expectedRecordVersion,
            tombstone,
          });
          return { deleted: true, sessionId, tombstone };
        },
      });
    },
    async listAuditEvents(filter = {}) {
      const events = await auditEventStore.listAuditEvents();
      return Object.freeze(events.filter((event) => matchesAuditFilter(event, filter)).map(freezeJson));
    },
  });
}

export function createInMemoryAuditEventStore(initialEvents = []) {
  const events = initialEvents.map(freezeJson);

  return Object.freeze({
    async saveAuditEvent(auditEvent) {
      const frozenEvent = freezeJson(auditEvent);
      events.push(frozenEvent);
      return frozenEvent;
    },
    async listAuditEvents() {
      return Object.freeze(events.map(freezeJson));
    },
    async clearAuditEvents() {
      events.length = 0;
    },
  });
}


export function createFileAuditEventStore({ directory, fileName = 'audit-events.jsonl' }) {
  if (!directory) {
    throw new TypeError('directory is required for createFileAuditEventStore');
  }
  assertNonEmptyString(fileName, 'fileName');
  const auditPath = join(directory, safeFileName(fileName));

  return Object.freeze({
    async saveAuditEvent(auditEvent) {
      const frozenEvent = freezeJson(auditEvent);
      await mkdir(directory, { recursive: true });
      await appendFile(auditPath, `${JSON.stringify(frozenEvent)}\n`, 'utf8');
      return frozenEvent;
    },
    async listAuditEvents() {
      const rawAuditLog = await readFile(auditPath, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      const events = rawAuditLog
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
      return Object.freeze(events.map(freezeJson));
    },
    async clearAuditEvents() {
      await mkdir(directory, { recursive: true });
      await writeFile(auditPath, '', 'utf8');
    },
  });
}


function evaluateSessionRetention({ record, context, defaultRetentionPolicy, evaluatedAt }) {
  const retentionPolicy = resolveRetentionPolicy(context.retentionPolicy ?? defaultRetentionPolicy);
  if (!retentionPolicy) return null;
  return evaluateRetentionDisposition({
    record,
    retentionPolicy,
    evaluatedAt,
    consentRecord: context.consentRecord ?? null,
  });
}

async function authorizeAndAudit({
  auditEventStore,
  now,
  context,
  learnerId,
  action,
  resourceType,
  resourceId,
  permission,
  consentScope,
  allowedReason,
  operation,
  policyCheck = null,
}) {
  assertAccessContext(context);
  assertFunction(operation, 'operation');
  if (policyCheck !== null) {
    assertFunction(policyCheck, 'policyCheck');
  }
  const checkedAt = now();
  const traceId = context.traceId ?? `trace_${sanitizeIdPart(action)}_${sanitizeIdPart(resourceId)}_${sanitizeIdPart(checkedAt)}`;
  const auditId = context.auditEventId ?? `audit_${sanitizeIdPart(action)}_${sanitizeIdPart(resourceId)}_${sanitizeIdPart(checkedAt)}`;
  const accessAllowed = canAccessLearner({
    account: context.account,
    link: context.link,
    learnerId,
    permission,
    at: checkedAt,
  });
  let reason = allowedReason;
  let allowed = accessAllowed;

  if (!accessAllowed) {
    reason = `account ${context.account.id} is not authorized to ${permission} for learner ${learnerId}`;
  }

  if (allowed && consentScope !== null) {
    try {
      assertConsentForLearner(context.consentRecord, consentScope, learnerId, checkedAt);
    } catch (error) {
      allowed = false;
      reason = error.message;
    }
  }

  if (allowed && policyCheck !== null) {
    try {
      policyCheck({ checkedAt });
    } catch (error) {
      allowed = false;
      reason = error.message;
    }
  }

  const auditEvent = createLearnerAccessAuditEvent({
    id: auditId,
    account: context.account,
    link: context.link,
    action,
    resourceType,
    resourceId,
    permission,
    consentScope,
    allowed,
    reason,
    traceId,
    occurredAt: checkedAt,
    metadata: context.metadata ?? {},
  });
  await auditEventStore.saveAuditEvent(auditEvent);

  if (!allowed) {
    throw new RangeError(reason);
  }

  return operation();
}

function assertConsentForLearner(consentRecord, consentScope, learnerId, checkedAt) {
  assertPlainObject(consentRecord, 'context.consentRecord');
  if (consentRecord.learnerId !== learnerId) {
    throw new RangeError(`consent learner ${consentRecord.learnerId} does not match session learner ${learnerId}`);
  }
  assertConsentAllows(consentRecord, consentScope, { at: checkedAt });
}

async function requireSessionRecord(sessionService, sessionId) {
  const record = await sessionService.loadSessionRecord(sessionId);
  if (record === null) {
    throw new RangeError(`session ${sessionId} was not found`);
  }
  return record;
}

function assertAccessContext(context) {
  assertPlainObject(context, 'context');
  assertPlainObject(context.account, 'context.account');
  assertPlainObject(context.link, 'context.link');
  if (context.consentRecord !== undefined && context.consentRecord !== null) {
    assertPlainObject(context.consentRecord, 'context.consentRecord');
  }
  if (context.retentionPolicy !== undefined && context.retentionPolicy !== null) {
    resolveRetentionPolicy(context.retentionPolicy);
  }
  if (context.metadata !== undefined) {
    assertPlainObject(context.metadata, 'context.metadata');
  }
  if (context.traceId !== undefined) {
    assertNonEmptyString(context.traceId, 'context.traceId');
  }
  if (context.auditEventId !== undefined) {
    assertNonEmptyString(context.auditEventId, 'context.auditEventId');
  }
  if (context.expectedRecordVersion !== undefined) {
    assertNonNegativeInteger(context.expectedRecordVersion, 'context.expectedRecordVersion');
  }
}

function matchesAuditFilter(event, filter) {
  return Object.entries(filter).every(([key, value]) => event[key] === value);
}

function requireLearnerId(value, fieldName) {
  assertNonEmptyString(value, fieldName);
  return value;
}

function assertService(value, fieldName) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function assertFunction(value, fieldName) {
  if (typeof value !== 'function') {
    throw new TypeError(`${fieldName} must be a function`);
  }
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function assertNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
}

function sanitizeIdPart(value) {
  return String(value).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'unknown';
}

function safeFileName(value) {
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
