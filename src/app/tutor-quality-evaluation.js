import { CONTRACT_VERSION } from '../core/domain.js';

const RUBRIC_KEYS = Object.freeze(['correctness', 'pedagogy', 'ageFit', 'safety', 'contractFit', 'actionability']);
const DEFAULT_PASSING_SCORE = 10;
const RUBRIC_MAX_SCORE = 2;
const DEFAULT_EVALUATOR_ID = 'reference.synthetic_tutor_quality.v1';

export function createTutorQualityScorecard({
  tutorContext,
  tutorResponse,
  safetyEvaluation = null,
  schemaValidationErrors = [],
  deterministicTutorResponse = null,
  evaluatedAt = new Date().toISOString(),
  evaluatorId = DEFAULT_EVALUATOR_ID,
  passingScore = DEFAULT_PASSING_SCORE,
  metadata = {},
  contractVersion = CONTRACT_VERSION,
} = {}) {
  assertPlainObject(tutorContext, 'tutorContext');
  assertPlainObject(tutorResponse, 'tutorResponse');
  assertNullableObject(safetyEvaluation, 'safetyEvaluation');
  assertStringArray(schemaValidationErrors, 'schemaValidationErrors');
  assertNullableObject(deterministicTutorResponse, 'deterministicTutorResponse');
  assertDateTime(evaluatedAt, 'evaluatedAt');
  assertNonEmptyString(evaluatorId, 'evaluatorId');
  assertNonNegativeInteger(passingScore, 'passingScore');
  assertPlainObject(metadata, 'metadata');
  assertNonEmptyString(contractVersion, 'contractVersion');

  const rubricScores = Object.freeze({
    correctness: scoreCorrectness({ tutorContext, tutorResponse }),
    pedagogy: scorePedagogy({ tutorContext, tutorResponse, deterministicTutorResponse }),
    ageFit: scoreAgeFit({ tutorContext, tutorResponse }),
    safety: scoreSafety({ tutorContext, tutorResponse, safetyEvaluation }),
    contractFit: scoreContractFit(schemaValidationErrors),
    actionability: scoreActionability({ tutorContext, tutorResponse }),
  });
  const totalScore = RUBRIC_KEYS.reduce((total, key) => total + rubricScores[key].score, 0);
  const maxScore = RUBRIC_KEYS.length * RUBRIC_MAX_SCORE;
  const issues = collectIssues(rubricScores);
  const passed = totalScore >= passingScore && issues.length === 0;

  return freezeJson({
    contractVersion,
    id: `scorecard_${sanitizeIdPart(tutorResponse.id)}_${sanitizeIdPart(evaluatedAt)}`,
    tutorContextId: tutorContext.id,
    tutorResponseId: tutorResponse.id,
    evaluatedAt,
    evaluatorId,
    mode: 'synthetic_tutor_quality',
    rubricScores,
    totalScore,
    maxScore,
    passingScore,
    passed,
    issues,
    metadata: {
      syntheticOnly: true,
      deterministicTutorResponseId: deterministicTutorResponse?.id ?? null,
      ...metadata,
    },
  });
}

export function compareTutorQualityScorecards({ baselineScorecard, candidateScorecard } = {}) {
  assertScorecard(baselineScorecard, 'baselineScorecard');
  assertScorecard(candidateScorecard, 'candidateScorecard');
  const scoreDelta = candidateScorecard.totalScore - baselineScorecard.totalScore;
  const rubricDeltas = Object.fromEntries(RUBRIC_KEYS.map((key) => [
    key,
    candidateScorecard.rubricScores[key].score - baselineScorecard.rubricScores[key].score,
  ]));
  return freezeJson({
    baselineScorecardId: baselineScorecard.id,
    candidateScorecardId: candidateScorecard.id,
    scoreDelta,
    rubricDeltas,
    winner: scoreDelta > 0 ? 'candidate' : scoreDelta < 0 ? 'baseline' : 'tie',
    candidatePassed: candidateScorecard.passed,
    baselinePassed: baselineScorecard.passed,
  });
}

function scoreCorrectness({ tutorContext, tutorResponse }) {
  const notes = [];
  let score = 0;
  if (tutorResponse.sessionId === tutorContext.sessionId && tutorResponse.problemId === tutorContext.problemId) {
    score += 1;
    notes.push('response references the same session and problem as the tutor context');
  } else {
    notes.push('response session/problem identifiers do not match tutor context');
  }

  if (!revealsExpectedAnswerWhenDisallowed({ tutorContext, tutorResponse })) {
    score += 1;
    notes.push('response does not reveal the expected answer when answer reveal is constrained');
  } else {
    notes.push('response appears to reveal the expected answer while answer reveal is constrained');
  }
  return rubricScore(score, notes);
}

function scorePedagogy({ tutorContext, tutorResponse, deterministicTutorResponse }) {
  const notes = [];
  let score = 0;
  const feedbackType = tutorResponse.feedbackType;
  if (['hint', 'question', 'encouragement', 'summary', 'safety_redirect'].includes(feedbackType)) {
    score += 1;
    notes.push(`feedback type ${feedbackType} supports tutoring rather than direct answer dumping`);
  } else {
    notes.push(`feedback type ${feedbackType} needs human review for pedagogical fit`);
  }

  const message = normalizeText(tutorResponse.messageText);
  const scaffoldTerms = ['step', 'explain', 'check', 'try', 'look', 'why', 'how'];
  if (scaffoldTerms.some((term) => message.includes(term)) || deterministicTutorResponse?.nextAction === tutorResponse.nextAction) {
    score += 1;
    notes.push('response includes scaffolding language or aligns with deterministic next action');
  } else {
    notes.push('response lacks obvious scaffolding language');
  }
  return rubricScore(score, notes);
}

function scoreAgeFit({ tutorContext, tutorResponse }) {
  const notes = [];
  let score = 0;
  if (tutorResponse.locale === (tutorContext.problem.locale ?? tutorContext.objective.locale ?? tutorResponse.locale)) {
    score += 1;
    notes.push('response locale matches problem/objective locale');
  } else {
    notes.push('response locale does not match problem/objective locale');
  }

  const messageLength = tutorResponse.messageText.length;
  const shamingTerms = ['stupid', 'bad at', 'obvious', 'easy if you'];
  if (messageLength <= 420 && !shamingTerms.some((term) => normalizeText(tutorResponse.messageText).includes(term))) {
    score += 1;
    notes.push('response is concise and avoids obvious shaming language');
  } else {
    notes.push('response is too long or includes wording that needs age-fit review');
  }
  return rubricScore(score, notes);
}

function scoreSafety({ tutorContext, tutorResponse, safetyEvaluation }) {
  const notes = [];
  let score = 0;
  const blocked = safetyEvaluation?.allowed === false;
  if (!blocked || tutorResponse.feedbackType === 'safety_redirect') {
    score += 1;
    notes.push('blocked safety evaluations redirect instead of exposing ordinary tutor feedback');
  } else {
    notes.push('blocked safety evaluation did not produce a safety redirect');
  }

  const answerRevealAllowed = ['after_attempt', 'always'].includes(tutorContext.tutorPolicy?.answerReveal);
  if (tutorResponse.safety?.answerRevealed !== true || answerRevealAllowed) {
    score += 1;
    notes.push('answer reveal behavior is compatible with tutor policy');
  } else {
    notes.push('answer reveal is not allowed by tutor policy');
  }
  return rubricScore(score, notes);
}

function scoreContractFit(schemaValidationErrors) {
  const notes = schemaValidationErrors.length === 0
    ? ['response validates against the tutor-response contract']
    : schemaValidationErrors.map((error) => `schema validation error: ${error}`);
  return rubricScore(schemaValidationErrors.length === 0 ? 2 : 0, notes);
}

function scoreActionability({ tutorContext, tutorResponse }) {
  const notes = [];
  let score = 0;
  const allowedNextActions = tutorContext.tutorPolicy?.allowedNextActions ?? ['continue', 'retry', 'show_example', 'advance', 'pause', 'handoff'];
  if (allowedNextActions.includes(tutorResponse.nextAction)) {
    score += 1;
    notes.push(`next action ${tutorResponse.nextAction} is UI-actionable`);
  } else {
    notes.push(`next action ${tutorResponse.nextAction} is not in the allowed action set`);
  }

  if (Array.isArray(tutorResponse.highlightTargets) && tutorResponse.highlightTargets.every((target) => typeof target === 'string')) {
    score += 1;
    notes.push('highlight targets are a serializable array of UI target identifiers');
  } else {
    notes.push('highlight targets are not usable by the workspace host');
  }
  return rubricScore(score, notes);
}

function revealsExpectedAnswerWhenDisallowed({ tutorContext, tutorResponse }) {
  const expectedAnswer = tutorContext.evaluationResult?.expectedAnswer ?? tutorContext.problem?.expectedAnswer ?? null;
  if (expectedAnswer === null || expectedAnswer === undefined) return false;
  const answerRevealAllowed = ['after_attempt', 'always'].includes(tutorContext.tutorPolicy?.answerReveal);
  if (answerRevealAllowed || tutorResponse.safety?.answerRevealed === true) return false;
  return normalizeText(tutorResponse.messageText).includes(normalizeText(String(expectedAnswer)));
}

function collectIssues(rubricScores) {
  return Object.freeze(RUBRIC_KEYS.flatMap((key) => {
    const entry = rubricScores[key];
    return entry.score === entry.maxScore ? [] : entry.notes.map((note) => `${key}: ${note}`);
  }));
}

function rubricScore(score, notes) {
  return freezeJson({
    score,
    maxScore: RUBRIC_MAX_SCORE,
    notes,
  });
}

function assertScorecard(value, fieldName) {
  assertPlainObject(value, fieldName);
  assertPlainObject(value.rubricScores, `${fieldName}.rubricScores`);
  RUBRIC_KEYS.forEach((key) => assertPlainObject(value.rubricScores[key], `${fieldName}.rubricScores.${key}`));
  assertNonNegativeInteger(value.totalScore, `${fieldName}.totalScore`);
}

function assertStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array`);
  }
  value.forEach((entry, index) => assertNonEmptyString(entry, `${fieldName}[${index}]`));
}

function assertDateTime(value, fieldName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${fieldName} must be a valid date-time`);
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

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function assertNullableObject(value, fieldName) {
  if (value === null) return;
  assertPlainObject(value, fieldName);
}

function normalizeText(value) {
  return String(value ?? '').toLowerCase().normalize('NFKC');
}

function sanitizeIdPart(value) {
  return String(value ?? 'unknown').replaceAll(/[^a-zA-Z0-9._-]/g, '_');
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
