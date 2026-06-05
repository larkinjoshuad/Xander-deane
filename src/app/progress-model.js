import { CONTRACT_VERSION } from '../core/domain.js';

export const MASTERY_LEVELS = Object.freeze(['not_started', 'emerging', 'developing', 'proficient', 'mastered']);
export const CONFIDENCE_LEVELS = Object.freeze(['low', 'medium', 'high']);

export function createSkillMastery({
  id,
  learnerId = null,
  objectiveId,
  subject,
  attemptCount = 0,
  correctCount = 0,
  masteryEstimate,
  masteryLevel,
  confidence,
  lastAttemptAt = null,
  lastUpdatedAt = new Date().toISOString(),
  evidence = [],
  recommendedNextObjectiveIds = [],
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  if (learnerId !== null) assertNonEmptyString(learnerId, 'learnerId');
  assertNonEmptyString(objectiveId, 'objectiveId');
  assertNonEmptyString(subject, 'subject');
  assertNonNegativeInteger(attemptCount, 'attemptCount');
  assertNonNegativeInteger(correctCount, 'correctCount');
  if (correctCount > attemptCount) {
    throw new RangeError('correctCount cannot exceed attemptCount');
  }
  assertDateTimeOrNull(lastAttemptAt, 'lastAttemptAt');
  assertDateTime(lastUpdatedAt, 'lastUpdatedAt');
  assertEvidence(evidence);
  assertStringArray(recommendedNextObjectiveIds, 'recommendedNextObjectiveIds');
  assertPlainObject(metadata, 'metadata');

  const resolvedMasteryEstimate = masteryEstimate ?? estimateMastery({ attemptCount, correctCount });
  assertRatio(resolvedMasteryEstimate, 'masteryEstimate');
  const resolvedMasteryLevel = masteryLevel ?? masteryLevelForEstimate({ masteryEstimate: resolvedMasteryEstimate, attemptCount });
  assertEnum(resolvedMasteryLevel, MASTERY_LEVELS, 'masteryLevel');
  const resolvedConfidence = confidence ?? confidenceForAttempts(attemptCount);
  assertEnum(resolvedConfidence, CONFIDENCE_LEVELS, 'confidence');

  return freezeJson({
    contractVersion,
    id,
    learnerId,
    objectiveId,
    subject,
    attemptCount,
    correctCount,
    masteryEstimate: resolvedMasteryEstimate,
    masteryLevel: resolvedMasteryLevel,
    confidence: resolvedConfidence,
    lastAttemptAt,
    lastUpdatedAt,
    evidence,
    recommendedNextObjectiveIds,
    metadata,
  });
}

export function createInitialSkillMastery({
  learnerId = null,
  objective,
  now = () => new Date().toISOString(),
  recommendedNextObjectiveIds = [],
  metadata = {},
} = {}) {
  assertPlainObject(objective, 'objective');
  return createSkillMastery({
    id: createSkillMasteryId({ learnerId, objectiveId: objective.id }),
    learnerId,
    objectiveId: objective.id,
    subject: objective.subject,
    attemptCount: 0,
    correctCount: 0,
    lastAttemptAt: null,
    lastUpdatedAt: now(),
    evidence: [],
    recommendedNextObjectiveIds,
    metadata,
  });
}

export function updateSkillMasteryFromEvaluation(skillMastery, {
  session,
  evaluation,
  now = () => new Date().toISOString(),
  recommendedNextObjectiveIds = skillMastery.recommendedNextObjectiveIds,
  metadata = skillMastery.metadata,
} = {}) {
  assertSkillMastery(skillMastery);
  assertPlainObject(session, 'session');
  assertPlainObject(evaluation, 'evaluation');
  assertNonEmptyString(session.sessionId, 'session.sessionId');
  assertPlainObject(session.problem, 'session.problem');
  assertNonEmptyString(session.problem.id, 'session.problem.id');
  assertNonEmptyString(evaluation.id, 'evaluation.id');
  assertBoolean(evaluation.isCorrect, 'evaluation.isCorrect');
  assertDateTime(evaluation.evaluatedAt, 'evaluation.evaluatedAt');

  if (session.problem.objectiveId !== skillMastery.objectiveId) {
    throw new RangeError('evaluation objective does not match skill mastery objective');
  }

  const attemptCount = skillMastery.attemptCount + 1;
  const correctCount = skillMastery.correctCount + (evaluation.isCorrect ? 1 : 0);
  const evidenceEntry = {
    sessionId: session.sessionId,
    problemId: session.problem.id,
    evaluationResultId: evaluation.id,
    isCorrect: evaluation.isCorrect,
    feedbackCode: evaluation.feedbackCode ?? '',
    attemptedAt: evaluation.evaluatedAt,
    metadata: summarizeEvaluationDiagnostics(evaluation),
  };

  return createSkillMastery({
    ...skillMastery,
    attemptCount,
    correctCount,
    masteryEstimate: undefined,
    masteryLevel: undefined,
    confidence: undefined,
    lastAttemptAt: evaluation.evaluatedAt,
    lastUpdatedAt: now(),
    evidence: [...skillMastery.evidence, evidenceEntry],
    recommendedNextObjectiveIds,
    metadata,
  });
}

export function summarizeSkillMastery(skillMastery) {
  assertSkillMastery(skillMastery);
  return freezeJson({
    objectiveId: skillMastery.objectiveId,
    subject: skillMastery.subject,
    attemptCount: skillMastery.attemptCount,
    correctCount: skillMastery.correctCount,
    masteryEstimate: skillMastery.masteryEstimate,
    masteryLevel: skillMastery.masteryLevel,
    confidence: skillMastery.confidence,
    needsPractice: ['not_started', 'emerging', 'developing'].includes(skillMastery.masteryLevel),
    readyToAdvance: ['proficient', 'mastered'].includes(skillMastery.masteryLevel),
    recommendedNextObjectiveIds: skillMastery.recommendedNextObjectiveIds,
  });
}

export function createProgressSummary({
  id,
  learnerId,
  skillMasteries,
  generatedAt = new Date().toISOString(),
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertArray(skillMasteries, 'skillMasteries');
  assertDateTime(generatedAt, 'generatedAt');
  assertPlainObject(metadata, 'metadata');
  skillMasteries.forEach(assertSkillMastery);

  const resolvedLearnerId = learnerId ?? resolveLearnerId(skillMasteries);
  if (resolvedLearnerId !== null) assertNonEmptyString(resolvedLearnerId, 'learnerId');
  assertConsistentLearner(skillMasteries, resolvedLearnerId);

  const objectiveSummaries = skillMasteries
    .map(summarizeSkillMastery)
    .sort((left, right) => `${left.subject}:${left.objectiveId}`.localeCompare(`${right.subject}:${right.objectiveId}`));
  const subjectSummaries = createSubjectSummaries(objectiveSummaries);
  const totals = createProgressTotals(objectiveSummaries);
  const recommendations = createProgressRecommendations(objectiveSummaries);

  return freezeJson({
    contractVersion,
    id,
    learnerId: resolvedLearnerId,
    generatedAt,
    totals,
    subjectSummaries,
    objectiveSummaries,
    recommendations,
    metadata,
  });
}

function resolveLearnerId(skillMasteries) {
  const learnerIds = [...new Set(skillMasteries.map((mastery) => mastery.learnerId))];
  if (learnerIds.length === 0) return null;
  if (learnerIds.length === 1) return learnerIds[0];
  return learnerIds.find((learnerId) => learnerId !== null) ?? null;
}

function assertConsistentLearner(skillMasteries, learnerId) {
  const mismatched = skillMasteries.find((mastery) => mastery.learnerId !== learnerId);
  if (mismatched) {
    throw new RangeError('skillMasteries must belong to the same learner');
  }
}

function createSubjectSummaries(objectiveSummaries) {
  const summariesBySubject = new Map();
  objectiveSummaries.forEach((summary) => {
    const existing = summariesBySubject.get(summary.subject) ?? {
      subject: summary.subject,
      objectiveCount: 0,
      attemptCount: 0,
      correctCount: 0,
      masteryEstimateTotal: 0,
      masteryLevelCounts: createMasteryLevelCounts(),
    };
    existing.objectiveCount += 1;
    existing.attemptCount += summary.attemptCount;
    existing.correctCount += summary.correctCount;
    existing.masteryEstimateTotal += summary.masteryEstimate;
    existing.masteryLevelCounts[summary.masteryLevel] += 1;
    summariesBySubject.set(summary.subject, existing);
  });

  return [...summariesBySubject.values()]
    .map((summary) => ({
      subject: summary.subject,
      objectiveCount: summary.objectiveCount,
      attemptCount: summary.attemptCount,
      correctCount: summary.correctCount,
      averageMasteryEstimate: averageOrZero(summary.masteryEstimateTotal, summary.objectiveCount),
      masteryLevelCounts: summary.masteryLevelCounts,
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject));
}

function createProgressTotals(objectiveSummaries) {
  const totals = objectiveSummaries.reduce((summary, objective) => ({
    objectiveCount: summary.objectiveCount + 1,
    attemptCount: summary.attemptCount + objective.attemptCount,
    correctCount: summary.correctCount + objective.correctCount,
    masteryEstimateTotal: summary.masteryEstimateTotal + objective.masteryEstimate,
    readyToAdvanceCount: summary.readyToAdvanceCount + (objective.readyToAdvance ? 1 : 0),
    needsPracticeCount: summary.needsPracticeCount + (objective.needsPractice ? 1 : 0),
  }), {
    objectiveCount: 0,
    attemptCount: 0,
    correctCount: 0,
    masteryEstimateTotal: 0,
    readyToAdvanceCount: 0,
    needsPracticeCount: 0,
  });

  return {
    objectiveCount: totals.objectiveCount,
    attemptCount: totals.attemptCount,
    correctCount: totals.correctCount,
    averageMasteryEstimate: averageOrZero(totals.masteryEstimateTotal, totals.objectiveCount),
    readyToAdvanceCount: totals.readyToAdvanceCount,
    needsPracticeCount: totals.needsPracticeCount,
  };
}

function createProgressRecommendations(objectiveSummaries) {
  return objectiveSummaries.flatMap((summary) => {
    if (summary.readyToAdvance) {
      return summary.recommendedNextObjectiveIds.map((objectiveId) => ({
        type: 'advance',
        objectiveId,
        subject: summary.subject,
        priority: 'medium',
        reason: `Learner is ready to advance after ${summary.objectiveId}.`,
      }));
    }

    if (summary.needsPractice) {
      return [{
        type: 'practice',
        objectiveId: summary.objectiveId,
        subject: summary.subject,
        priority: ['not_started', 'emerging'].includes(summary.masteryLevel) ? 'high' : 'medium',
        reason: `Learner is still ${summary.masteryLevel.replaceAll('_', ' ')} this objective.`,
      }];
    }

    return [{
      type: 'review',
      objectiveId: summary.objectiveId,
      subject: summary.subject,
      priority: 'low',
      reason: 'Learner can review this objective later for retention.',
    }];
  });
}

function createMasteryLevelCounts() {
  return Object.fromEntries(MASTERY_LEVELS.map((level) => [level, 0]));
}

function averageOrZero(total, count) {
  if (count === 0) return 0;
  return roundToTwoDecimals(total / count);
}

function estimateMastery({ attemptCount, correctCount }) {
  if (attemptCount === 0) return 0;
  return roundToTwoDecimals(correctCount / attemptCount);
}

function masteryLevelForEstimate({ masteryEstimate, attemptCount }) {
  if (attemptCount === 0) return 'not_started';
  if (masteryEstimate >= 0.9 && attemptCount >= 3) return 'mastered';
  if (masteryEstimate >= 0.75 && attemptCount >= 2) return 'proficient';
  if (masteryEstimate >= 0.4) return 'developing';
  return 'emerging';
}

function confidenceForAttempts(attemptCount) {
  if (attemptCount >= 5) return 'high';
  if (attemptCount >= 2) return 'medium';
  return 'low';
}

function summarizeEvaluationDiagnostics(evaluation) {
  if (!evaluation.diagnostics || typeof evaluation.diagnostics !== 'object') return {};
  return Object.fromEntries(
    Object.entries(evaluation.diagnostics).filter(([, value]) => isJsonValue(value)),
  );
}

function createSkillMasteryId({ learnerId, objectiveId }) {
  return `mastery_${sanitizeIdPart(learnerId ?? 'anonymous')}_${sanitizeIdPart(objectiveId)}`;
}

function sanitizeIdPart(value) {
  return String(value).replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

function roundToTwoDecimals(value) {
  return Math.round(value * 100) / 100;
}

function assertSkillMastery(value) {
  assertPlainObject(value, 'skillMastery');
  assertNonEmptyString(value.id, 'skillMastery.id');
  assertNonEmptyString(value.objectiveId, 'skillMastery.objectiveId');
  assertNonEmptyString(value.subject, 'skillMastery.subject');
  assertNonNegativeInteger(value.attemptCount, 'skillMastery.attemptCount');
  assertNonNegativeInteger(value.correctCount, 'skillMastery.correctCount');
  assertRatio(value.masteryEstimate, 'skillMastery.masteryEstimate');
  assertEnum(value.masteryLevel, MASTERY_LEVELS, 'skillMastery.masteryLevel');
  assertEnum(value.confidence, CONFIDENCE_LEVELS, 'skillMastery.confidence');
  assertEvidence(value.evidence);
}

function assertEvidence(value) {
  assertArray(value, 'evidence');
  value.forEach((entry, index) => {
    assertPlainObject(entry, `evidence[${index}]`);
    assertNonEmptyString(entry.sessionId, `evidence[${index}].sessionId`);
    assertNonEmptyString(entry.problemId, `evidence[${index}].problemId`);
    assertNonEmptyString(entry.evaluationResultId, `evidence[${index}].evaluationResultId`);
    assertBoolean(entry.isCorrect, `evidence[${index}].isCorrect`);
    assertString(entry.feedbackCode, `evidence[${index}].feedbackCode`);
    assertDateTime(entry.attemptedAt, `evidence[${index}].attemptedAt`);
    assertPlainObject(entry.metadata ?? {}, `evidence[${index}].metadata`);
  });
}

function assertDateTimeOrNull(value, fieldName) {
  if (value === null) return;
  assertDateTime(value, fieldName);
}

function assertDateTime(value, fieldName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${fieldName} must be a valid date-time`);
  }
}

function assertRatio(value, fieldName) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${fieldName} must be a number between 0 and 1`);
  }
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new RangeError(`${fieldName} must be one of ${allowedValues.join(', ')}`);
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

function assertString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string`);
  }
}

function assertStringArray(value, fieldName) {
  assertArray(value, fieldName);
  value.forEach((item, index) => assertNonEmptyString(item, `${fieldName}[${index}]`));
}

function assertBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${fieldName} must be a boolean`);
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

function isJsonValue(value) {
  if (value === null) return true;
  if (['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (value && typeof value === 'object') return Object.values(value).every(isJsonValue);
  return false;
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
