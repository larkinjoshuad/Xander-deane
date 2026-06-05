import { CONTRACT_VERSION } from '../core/domain.js';
import { summarizeConsentSafety } from './consent-safety.js';

export function createTutorContext({
  id,
  session,
  learnerProfile = null,
  deviceProfile = null,
  skillMastery = null,
  progressSummary = null,
  consentRecord = null,
  safetyPolicy = null,
  maxRecentEvents = 10,
  mayCallAi = false,
  generatedAt = new Date().toISOString(),
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertPlainObject(session, 'session');
  assertNonEmptyString(session.sessionId, 'session.sessionId');
  assertPlainObject(session.problem, 'session.problem');
  assertPlainObject(session.subjectPack, 'session.subjectPack');
  assertPlainObject(session.workspaceSnapshot, 'session.workspaceSnapshot');
  assertPlainObject(session.tutorPolicy, 'session.tutorPolicy');
  assertArray(session.events, 'session.events');
  assertNonNegativeInteger(maxRecentEvents, 'maxRecentEvents');
  assertBoolean(mayCallAi, 'mayCallAi');
  assertDateTime(generatedAt, 'generatedAt');
  assertPlainObject(metadata, 'metadata');
  assertNullableObject(learnerProfile, 'learnerProfile');
  assertNullableObject(deviceProfile, 'deviceProfile');
  assertNullableObject(skillMastery, 'skillMastery');
  assertNullableObject(progressSummary, 'progressSummary');
  assertNullableObject(consentRecord, 'consentRecord');
  assertNullableObject(safetyPolicy, 'safetyPolicy');

  const objective = resolveObjective(session);
  const resolvedId = id ?? `ctx_${sanitizeIdPart(session.sessionId)}_${sanitizeIdPart(generatedAt)}`;
  const recentEvents = session.events.slice(-maxRecentEvents);
  const learnerId = session.learnerId ?? learnerProfile?.id ?? null;

  return freezeJson({
    contractVersion,
    id: resolvedId,
    sessionId: session.sessionId,
    learnerId,
    objectiveId: session.problem.objectiveId,
    problemId: session.problem.id,
    generatedAt,
    learnerProfile,
    deviceProfile,
    objective,
    problem: session.problem,
    recentEvents,
    workspaceSnapshot: session.workspaceSnapshot,
    evaluationResult: session.evaluation ?? null,
    tutorPolicy: session.tutorPolicy,
    skillMastery,
    progressSummary,
    consentSafetySummary: summarizeConsentSafety({ consentRecord, safetyPolicy, at: generatedAt }),
    constraints: {
      maxRecentEvents,
      allowedModalities: session.tutorPolicy.allowedModalities,
      answerReveal: session.tutorPolicy.answerReveal,
      presentationMode: deviceProfile?.presentationMode ?? null,
      mustValidateTutorResponse: true,
      mayCallAi,
    },
    metadata,
  });
}

export function summarizeTutorContext(tutorContext) {
  assertTutorContext(tutorContext);
  return freezeJson({
    sessionId: tutorContext.sessionId,
    learnerId: tutorContext.learnerId,
    objectiveId: tutorContext.objectiveId,
    problemId: tutorContext.problemId,
    eventCount: tutorContext.recentEvents.length,
    hasEvaluation: tutorContext.evaluationResult !== null,
    hasSkillMastery: tutorContext.skillMastery !== null,
    hasProgressSummary: tutorContext.progressSummary !== null,
    consentStatus: tutorContext.consentSafetySummary?.consentStatus ?? 'missing',
    activeConsentScopes: tutorContext.consentSafetySummary?.activeScopes ?? [],
    safetyPolicyId: tutorContext.consentSafetySummary?.safetyPolicyId ?? null,
    aiAutonomyLevel: tutorContext.consentSafetySummary?.aiAutonomyLevel ?? 'unknown',
    allowedModalities: tutorContext.constraints.allowedModalities,
    presentationMode: tutorContext.constraints.presentationMode,
    mayCallAi: tutorContext.constraints.mayCallAi,
  });
}

export function assertTutorContext(tutorContext) {
  assertPlainObject(tutorContext, 'tutorContext');
  assertNonEmptyString(tutorContext.id, 'tutorContext.id');
  assertNonEmptyString(tutorContext.sessionId, 'tutorContext.sessionId');
  assertNonEmptyString(tutorContext.objectiveId, 'tutorContext.objectiveId');
  assertNonEmptyString(tutorContext.problemId, 'tutorContext.problemId');
  assertDateTime(tutorContext.generatedAt, 'tutorContext.generatedAt');
  assertPlainObject(tutorContext.objective, 'tutorContext.objective');
  assertPlainObject(tutorContext.problem, 'tutorContext.problem');
  assertArray(tutorContext.recentEvents, 'tutorContext.recentEvents');
  assertPlainObject(tutorContext.workspaceSnapshot, 'tutorContext.workspaceSnapshot');
  assertPlainObject(tutorContext.tutorPolicy, 'tutorContext.tutorPolicy');
  assertPlainObject(tutorContext.consentSafetySummary, 'tutorContext.consentSafetySummary');
  assertPlainObject(tutorContext.constraints, 'tutorContext.constraints');
  assertBoolean(tutorContext.constraints.mustValidateTutorResponse, 'tutorContext.constraints.mustValidateTutorResponse');
  assertBoolean(tutorContext.constraints.mayCallAi, 'tutorContext.constraints.mayCallAi');
  return tutorContext;
}

function resolveObjective(session) {
  const objective = session.subjectPack.objectives.find((item) => item.id === session.problem.objectiveId);
  if (!objective) {
    throw new RangeError('session subjectPack does not contain the active problem objective');
  }
  return objective;
}

function sanitizeIdPart(value) {
  return String(value).replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

function assertNullableObject(value, fieldName) {
  if (value === null) return;
  assertPlainObject(value, fieldName);
}

function assertDateTime(value, fieldName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${fieldName} must be a valid date-time`);
  }
}

function assertBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${fieldName} must be a boolean`);
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
