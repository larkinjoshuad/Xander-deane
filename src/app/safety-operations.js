import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createAuditEvent } from './audit-log.js';
import { createSafetyIncident } from './consent-safety.js';

const CRITICAL_TRIGGERS = Object.freeze(['self_harm', 'abuse_disclosure', 'medical_emergency']);

export function createSafetyOperationsService({
  incidentStore = createInMemorySafetyIncidentStore(),
  auditEventStore = null,
  now = () => new Date().toISOString(),
} = {}) {
  assertIncidentStore(incidentStore, 'incidentStore');
  assertOptionalAuditStore(auditEventStore, 'auditEventStore');
  assertFunction(now, 'now');

  return Object.freeze({
    async recordTutorSafetyOutcome({
      tutorContext,
      safetyEvaluation,
      tutorResponse = null,
      gatewayResult = null,
      accountId = null,
      traceId = null,
      relatedEventId = null,
      metadata = {},
    } = {}) {
      const resolvedEvaluation = safetyEvaluation ?? gatewayResult?.safetyEvaluation;
      const resolvedTutorResponse = tutorResponse ?? gatewayResult?.tutorResponse ?? null;
      assertPlainObject(tutorContext, 'tutorContext');
      assertPlainObject(resolvedEvaluation, 'safetyEvaluation');
      assertOptionalObject(resolvedTutorResponse, 'tutorResponse');
      assertOptionalString(accountId, 'accountId');
      assertOptionalString(traceId, 'traceId');
      assertOptionalString(relatedEventId, 'relatedEventId');
      assertPlainObject(metadata, 'metadata');

      if (resolvedEvaluation.allowed === true && (resolvedEvaluation.requiredActions ?? []).length === 0) {
        return freezeJson({ status: 'allowed', incident: null, auditEvent: null });
      }

      const occurredAt = now();
      assertDateTime(occurredAt, 'occurredAt');
      const incident = createIncidentFromSafetyOutcome({
        tutorContext,
        safetyEvaluation: resolvedEvaluation,
        tutorResponse: resolvedTutorResponse,
        occurredAt,
        relatedEventId,
        metadata,
      });
      const savedIncident = await incidentStore.saveIncident(incident);
      const auditEvent = auditEventStore
        ? await auditEventStore.saveAuditEvent(createSafetyIncidentAuditEvent({
          incident: savedIncident,
          accountId,
          traceId: traceId ?? savedIncident.metadata.traceId,
          occurredAt,
        }))
        : null;

      return freezeJson({
        status: savedIncident.actionTaken === 'human_review' ? 'escalated' : 'blocked',
        incident: savedIncident,
        auditEvent,
      });
    },
    async listIncidents(filter = {}) {
      assertPlainObject(filter, 'filter');
      const incidents = await incidentStore.listIncidents();
      return Object.freeze(incidents.filter((incident) => matchesIncidentFilter(incident, filter)).map(freezeJson));
    },
  });
}

export function createIncidentFromSafetyOutcome({
  tutorContext,
  safetyEvaluation,
  tutorResponse = null,
  occurredAt = new Date().toISOString(),
  relatedEventId = null,
  metadata = {},
} = {}) {
  assertPlainObject(tutorContext, 'tutorContext');
  assertPlainObject(safetyEvaluation, 'safetyEvaluation');
  assertOptionalObject(tutorResponse, 'tutorResponse');
  assertDateTime(occurredAt, 'occurredAt');
  assertOptionalString(relatedEventId, 'relatedEventId');
  assertPlainObject(metadata, 'metadata');

  const blockedReasons = [...(safetyEvaluation.blockedReasons ?? [])];
  const requiredActions = [...(safetyEvaluation.requiredActions ?? [])];
  const trigger = inferTrigger({ blockedReasons, requiredActions });
  const category = inferCategory(trigger);
  const actionTaken = inferActionTaken(requiredActions);
  const severity = inferSeverity({ trigger, requiredActions });
  const policyId = tutorContext.consentSafetySummary?.safetyPolicyId ?? tutorContext.safetyPolicy?.id ?? 'unknown_safety_policy';
  const sessionId = tutorContext.sessionId;
  const incidentId = `incident_${sanitizeIdPart(sessionId)}_${sanitizeIdPart(trigger)}_${sanitizeIdPart(occurredAt)}`;

  return createSafetyIncident({
    id: incidentId,
    sessionId,
    learnerId: tutorContext.learnerId ?? null,
    policyId,
    severity,
    category,
    trigger,
    description: describeIncident({ trigger, category, actionTaken }),
    actionTaken,
    occurredAt,
    relatedEventId,
    tutorResponseId: tutorResponse?.id ?? null,
    metadata: {
      blockedReasons,
      requiredActions,
      tutorContextId: tutorContext.id ?? null,
      traceId: metadata.traceId ?? null,
      ...metadata,
    },
  });
}

export function createInMemorySafetyIncidentStore(initialIncidents = []) {
  const incidents = initialIncidents.map(freezeJson);

  return Object.freeze({
    async saveIncident(incident) {
      const frozenIncident = freezeJson(incident);
      incidents.push(frozenIncident);
      return frozenIncident;
    },
    async listIncidents() {
      return Object.freeze(incidents.map(freezeJson));
    },
    async clearIncidents() {
      incidents.length = 0;
    },
  });
}

export function createFileSafetyIncidentStore({ directory, fileName = 'safety-incidents.jsonl' }) {
  if (!directory) {
    throw new TypeError('directory is required for createFileSafetyIncidentStore');
  }
  assertNonEmptyString(fileName, 'fileName');
  const incidentPath = join(directory, safeFileName(fileName));

  return Object.freeze({
    async saveIncident(incident) {
      const frozenIncident = freezeJson(incident);
      await mkdir(dirname(incidentPath), { recursive: true });
      await appendFile(incidentPath, `${JSON.stringify(frozenIncident)}\n`, 'utf8');
      return frozenIncident;
    },
    async listIncidents() {
      const rawLog = await readFile(incidentPath, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      return Object.freeze(rawLog
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => freezeJson(JSON.parse(line))));
    },
  });
}

function createSafetyIncidentAuditEvent({ incident, accountId, traceId, occurredAt }) {
  const requiresHumanReview = incident.metadata.requiredActions?.includes('human_review') === true;
  return createAuditEvent({
    id: `audit_${sanitizeIdPart(incident.id)}`,
    occurredAt,
    actorAccountId: accountId,
    learnerId: incident.learnerId,
    action: 'safety.incident.create',
    resourceType: 'safety_incident',
    resourceId: incident.id,
    decision: requiresHumanReview ? 'escalated' : 'logged',
    reason: incident.description,
    traceId: traceId ?? `trace_${sanitizeIdPart(incident.id)}`,
    metadata: {
      sessionId: incident.sessionId,
      policyId: incident.policyId,
      severity: incident.severity,
      category: incident.category,
      trigger: incident.trigger,
      actionTaken: incident.actionTaken,
      requiredActions: incident.metadata.requiredActions ?? [],
      blockedReasons: incident.metadata.blockedReasons ?? [],
    },
  });
}

function inferTrigger({ blockedReasons, requiredActions }) {
  const escalationReason = blockedReasons.find((reason) => reason.startsWith('escalation_trigger:'));
  if (escalationReason) return escalationReason.split(':').at(1);
  const blockedCategory = blockedReasons.find((reason) => reason.startsWith('blocked_content_category:'));
  if (blockedCategory) return blockedCategory.split(':').at(1);
  const consentReason = blockedReasons.find((reason) => reason.startsWith('missing_active_consent:'));
  if (consentReason) return consentReason.split(':').at(1);
  if (requiredActions.includes('human_review')) return 'human_review';
  return 'safety_policy_review';
}

function inferCategory(trigger) {
  if (['ai_tutoring', 'analytics', 'progress_tracking', 'personalization', 'guardian_notifications', 'data_export'].includes(trigger)) {
    return 'consent';
  }
  if (['privacy_request'].includes(trigger)) return 'privacy';
  if (['self_harm', 'abuse_disclosure', 'medical_emergency', 'learner_distress'].includes(trigger)) return 'learner_wellbeing';
  return 'content_safety';
}

function inferActionTaken(requiredActions) {
  if (requiredActions.includes('block_tutor_response')) return 'blocked';
  if (requiredActions.includes('human_review')) return 'human_review';
  return 'logged_only';
}

function inferSeverity({ trigger, requiredActions }) {
  if (CRITICAL_TRIGGERS.includes(trigger)) return 'critical';
  if (requiredActions.includes('human_review')) return 'medium';
  if (requiredActions.includes('block_tutor_response')) return 'low';
  return 'info';
}

function describeIncident({ trigger, category, actionTaken }) {
  if (actionTaken === 'blocked') {
    return `Tutor output was blocked for ${category} trigger ${trigger}.`;
  }
  if (actionTaken === 'human_review') {
    return `Tutor output requires human review for ${category} trigger ${trigger}.`;
  }
  return `Tutor safety outcome was logged for ${category} trigger ${trigger}.`;
}

function matchesIncidentFilter(incident, filter) {
  return Object.entries(filter).every(([key, value]) => incident[key] === value);
}

function assertIncidentStore(value, fieldName) {
  if (!value || typeof value.saveIncident !== 'function' || typeof value.listIncidents !== 'function') {
    throw new TypeError(`${fieldName} must provide saveIncident and listIncidents`);
  }
}

function assertOptionalAuditStore(value, fieldName) {
  if (value === null || value === undefined) return;
  if (!value || typeof value.saveAuditEvent !== 'function') {
    throw new TypeError(`${fieldName}.saveAuditEvent must be a function`);
  }
}

function assertFunction(value, fieldName) {
  if (typeof value !== 'function') {
    throw new TypeError(`${fieldName} must be a function`);
  }
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

function assertOptionalString(value, fieldName) {
  if (value === null || value === undefined) return;
  assertNonEmptyString(value, fieldName);
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function assertOptionalObject(value, fieldName) {
  if (value === null || value === undefined) return;
  assertPlainObject(value, fieldName);
}

function sanitizeIdPart(value) {
  return String(value ?? 'unknown').replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

function safeFileName(value) {
  return sanitizeIdPart(value);
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
