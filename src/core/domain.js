/**
 * Subject-agnostic learning domain primitives.
 *
 * This module intentionally avoids framework and vendor dependencies so the
 * same contracts can be mirrored in other languages and services. The JSON
 * schemas in /schemas are the cross-language source of truth; these helpers
 * provide a lightweight JavaScript reference implementation for early UI/API
 * prototypes.
 */

export const CONTRACT_VERSION = '0.1.0';

export const SUPPORTED_SUBJECTS = Object.freeze([
  'math',
  'language',
  'science',
  'history',
  'arts',
  'social_studies',
  'computer_science',
  'world_languages',
  'life_skills',
  'custom',
]);

export const MODALITIES = Object.freeze([
  'text',
  'audio',
  'video',
  'drawing',
  'touch',
  'gesture',
  'manipulative',
  'camera',
]);

export const INTERACTION_TYPES = Object.freeze([
  'problem_presented',
  'user_typed',
  'user_spoke',
  'user_drew',
  'user_dragged',
  'user_tapped',
  'user_selected',
  'ai_message_shown',
  'ai_spoke',
  'ai_highlighted',
  'answer_checked',
  'hint_requested',
  'tool_changed',
  'workspace_reset',
]);

export const FEEDBACK_TYPES = Object.freeze([
  'encouragement',
  'hint',
  'correction',
  'explanation',
  'question',
  'summary',
  'safety_redirect',
]);

export const NEXT_ACTIONS = Object.freeze([
  'continue',
  'retry',
  'show_example',
  'advance',
  'pause',
  'handoff',
]);

export const CONFIDENCE_LEVELS = Object.freeze(['low', 'medium', 'high']);

export function createLearningObjective({
  id,
  subject,
  locale = 'en-US',
  title,
  description,
  standards = [],
  prerequisites = [],
  tags = [],
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertEnum(subject, SUPPORTED_SUBJECTS, 'subject');
  assertLocale(locale);
  assertNonEmptyString(title, 'title');
  assertStringArray(standards, 'standards');
  assertStringArray(prerequisites, 'prerequisites');
  assertStringArray(tags, 'tags');
  assertNonEmptyString(contractVersion, 'contractVersion');

  return freezeContract({
    contractVersion,
    id,
    subject,
    locale,
    title,
    description: description ?? title,
    standards,
    prerequisites,
    tags,
  });
}

export function createProblem({
  id,
  objectiveId,
  subject,
  locale = 'en-US',
  prompt,
  difficulty = 'intro',
  expectedAnswer,
  acceptableAnswers = [],
  interactionModes = ['text'],
  workspace = { kind: 'generic', state: {} },
  metadata = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertNonEmptyString(objectiveId, 'objectiveId');
  assertEnum(subject, SUPPORTED_SUBJECTS, 'subject');
  assertLocale(locale);
  assertNonEmptyString(prompt, 'prompt');
  assertNonEmptyString(difficulty, 'difficulty');
  assertJsonValue(expectedAnswer, 'expectedAnswer');
  assertArray(acceptableAnswers, 'acceptableAnswers');
  acceptableAnswers.forEach((answer, index) => assertJsonValue(answer, `acceptableAnswers[${index}]`));
  assertArray(interactionModes, 'interactionModes');
  interactionModes.forEach((mode) => assertEnum(mode, MODALITIES, 'interactionModes'));
  assertWorkspace(workspace);
  assertPlainObject(metadata, 'metadata');
  assertNonEmptyString(contractVersion, 'contractVersion');

  return freezeContract({
    contractVersion,
    id,
    objectiveId,
    subject,
    locale,
    prompt,
    difficulty,
    expectedAnswer,
    acceptableAnswers,
    interactionModes,
    workspace,
    metadata,
  });
}

export function createInteractionEvent({
  id,
  sessionId,
  learnerId = null,
  problemId,
  type,
  occurredAt = new Date().toISOString(),
  modality = 'text',
  payload = {},
  trace = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertNonEmptyString(sessionId, 'sessionId');
  assertOptionalString(learnerId, 'learnerId');
  assertNonEmptyString(problemId, 'problemId');
  assertEnum(type, INTERACTION_TYPES, 'type');
  assertDateTime(occurredAt, 'occurredAt');
  assertEnum(modality, MODALITIES, 'modality');
  assertPlainObject(payload, 'payload');
  assertPlainObject(trace, 'trace');
  assertNonEmptyString(contractVersion, 'contractVersion');

  return freezeContract({
    contractVersion,
    id,
    sessionId,
    learnerId,
    problemId,
    type,
    occurredAt,
    modality,
    payload,
    trace,
  });
}

export function evaluateAnswer(problem, answer) {
  assertPlainObject(problem, 'problem');
  assertJsonValue(problem.expectedAnswer, 'problem.expectedAnswer');
  const submittedAnswer = answer ?? null;
  assertJsonValue(submittedAnswer, 'answer');
  const expected = normalizeAnswer(problem.expectedAnswer, problem.locale);
  const accepted = (problem.acceptableAnswers ?? []).map((acceptedAnswer) =>
    normalizeAnswer(acceptedAnswer, problem.locale),
  );
  const submitted = normalizeAnswer(answer, problem.locale);
  const isCorrect = submitted === expected || accepted.includes(submitted);

  return freezeContract({
    contractVersion: problem.contractVersion ?? CONTRACT_VERSION,
    isCorrect,
    submittedAnswer,
    expectedAnswer: problem.expectedAnswer,
    feedbackCode: isCorrect ? 'correct' : 'needs_guidance',
  });
}

export function createTutorResponse({
  id,
  sessionId,
  problemId,
  locale = 'en-US',
  feedbackType,
  messageText,
  speechText,
  nextAction = 'continue',
  highlightTargets = [],
  safety = { answerRevealed: false, confidence: 'medium' },
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertNonEmptyString(sessionId, 'sessionId');
  assertNonEmptyString(problemId, 'problemId');
  assertLocale(locale);
  assertEnum(feedbackType, FEEDBACK_TYPES, 'feedbackType');
  assertNonEmptyString(messageText, 'messageText');
  assertOptionalNonEmptyString(speechText, 'speechText');
  assertEnum(nextAction, NEXT_ACTIONS, 'nextAction');
  assertStringArray(highlightTargets, 'highlightTargets');
  assertSafety(safety);
  assertNonEmptyString(contractVersion, 'contractVersion');

  return freezeContract({
    contractVersion,
    id,
    sessionId,
    problemId,
    locale,
    feedbackType,
    messageText,
    speechText: speechText ?? messageText,
    nextAction,
    highlightTargets,
    safety,
  });
}

function normalizeAnswer(value, locale = 'en-US') {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase(locale)
    .replace(/\s+/g, ' ');
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
}

function assertOptionalNonEmptyString(value, fieldName) {
  if (value !== undefined) {
    assertNonEmptyString(value, fieldName);
  }
}

function assertOptionalString(value, fieldName) {
  if (value !== null && typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string or null`);
  }
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new RangeError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }
}

function assertLocale(value) {
  assertNonEmptyString(value, 'locale');
  try {
    Intl.getCanonicalLocales(value);
  } catch {
    throw new RangeError('locale must be a valid BCP 47 language tag');
  }
}

function assertDateTime(value, fieldName) {
  assertNonEmptyString(value, fieldName);
  if (Number.isNaN(Date.parse(value))) {
    throw new RangeError(`${fieldName} must be an ISO-8601 date-time string`);
  }
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array`);
  }
}

function assertStringArray(value, fieldName) {
  assertArray(value, fieldName);
  value.forEach((item, index) => assertNonEmptyString(item, `${fieldName}[${index}]`));
}

function assertPlainObject(value, fieldName) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${fieldName} must be a plain object`);
  }
  assertJsonValue(value, fieldName);
}

function assertWorkspace(workspace) {
  assertPlainObject(workspace, 'workspace');
  assertNonEmptyString(workspace.kind, 'workspace.kind');
  assertPlainObject(workspace.state, 'workspace.state');
}

function assertSafety(safety) {
  assertPlainObject(safety, 'safety');
  if (typeof safety.answerRevealed !== 'boolean') {
    throw new TypeError('safety.answerRevealed must be a boolean');
  }
  assertEnum(safety.confidence, CONFIDENCE_LEVELS, 'safety.confidence');
}

function assertJsonValue(value, fieldName, seen = new WeakSet()) {
  if (value === null) return;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return;
  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${fieldName} must be a finite number`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError(`${fieldName} must not contain circular references`);
    }
    seen.add(value);
    value.forEach((item, index) => assertJsonValue(item, `${fieldName}[${index}]`, seen));
    seen.delete(value);
    return;
  }
  if (valueType === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    if (seen.has(value)) {
      throw new TypeError(`${fieldName} must not contain circular references`);
    }
    seen.add(value);
    Object.entries(value).forEach(([key, nestedValue]) => {
      if (nestedValue === undefined) {
        throw new TypeError(`${fieldName}.${key} must not be undefined`);
      }
      assertJsonValue(nestedValue, `${fieldName}.${key}`, seen);
    });
    seen.delete(value);
    return;
  }
  throw new TypeError(`${fieldName} must be JSON-compatible`);
}

function freezeContract(value) {
  return freezeDeep(cloneJson(value));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freezeDeep);
  }
  return value;
}
