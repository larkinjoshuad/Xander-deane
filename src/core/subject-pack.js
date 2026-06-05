import { CONTRACT_VERSION, SUPPORTED_SUBJECTS, evaluateAnswer } from './domain.js';

/**
 * Creates a portable subject pack descriptor for subject-specific content,
 * deterministic evaluators, and workspace descriptors.
 *
 * Evaluators and workspace renderers are JavaScript-only extension points for
 * the reference runtime. The portable content itself remains the objective and
 * problem JSON described by the schemas.
 */
export function createSubjectPack({
  id,
  subject,
  locale = 'en-US',
  objectives = [],
  problems = [],
  evaluators = {},
  workspaceRenderers = {},
  tutorPolicies = {},
  contractVersion = CONTRACT_VERSION,
}) {
  assertNonEmptyString(id, 'id');
  assertEnum(subject, SUPPORTED_SUBJECTS, 'subject');
  assertNonEmptyString(locale, 'locale');
  assertNonEmptyString(contractVersion, 'contractVersion');
  assertArray(objectives, 'objectives');
  assertArray(problems, 'problems');
  assertFunctionMap(evaluators, 'evaluators');
  assertFunctionMap(workspaceRenderers, 'workspaceRenderers');
  assertPlainObject(tutorPolicies, 'tutorPolicies');
  assertJsonValue(tutorPolicies, 'tutorPolicies');

  const objectiveIds = new Set();
  objectives.forEach((objective, index) => {
    assertPackContract(objective, `objectives[${index}]`, subject, contractVersion);
    assertUniqueId(objectiveIds, objective.id, `objectives[${index}].id`);
  });

  const problemIds = new Set();
  problems.forEach((problem, index) => {
    assertPackContract(problem, `problems[${index}]`, subject, contractVersion);
    assertUniqueId(problemIds, problem.id, `problems[${index}].id`);
    if (!objectiveIds.has(problem.objectiveId)) {
      throw new RangeError(`problems[${index}].objectiveId must reference an objective in the pack`);
    }
  });

  return Object.freeze({
    contractVersion,
    id,
    subject,
    locale,
    objectives: freezeArrayCopy(objectives),
    problems: freezeArrayCopy(problems),
    evaluators: Object.freeze({ ...evaluators }),
    workspaceRenderers: Object.freeze({ ...workspaceRenderers }),
    tutorPolicies: freezeJson(tutorPolicies),
  });
}

export function findProblem(subjectPack, problemId) {
  assertSubjectPack(subjectPack);
  assertNonEmptyString(problemId, 'problemId');
  return subjectPack.problems.find((problem) => problem.id === problemId) ?? null;
}

export function evaluateSubjectProblem(subjectPack, problemIdOrProblem, answer, context = {}) {
  assertSubjectPack(subjectPack);
  const problem = resolveProblem(subjectPack, problemIdOrProblem);
  const evaluator = subjectPack.evaluators[problem.workspace.kind];

  if (!evaluator) {
    return Object.freeze({
      ...evaluateAnswer(problem, answer),
      evaluatorId: 'core.evaluateAnswer',
    });
  }

  const result = evaluator({ problem, answer, context, subjectPack });
  assertPlainObject(result, 'evaluator result');
  assertJsonValue(result, 'evaluator result');

  return Object.freeze({
    contractVersion: problem.contractVersion ?? subjectPack.contractVersion,
    expectedAnswer: problem.expectedAnswer,
    feedbackCode: result.isCorrect ? 'correct' : 'needs_guidance',
    ...result,
    evaluatorId: `${subjectPack.id}.${problem.workspace.kind}`,
  });
}

export function createWorkspaceDescriptor(subjectPack, problemIdOrProblem, context = {}) {
  assertSubjectPack(subjectPack);
  const problem = resolveProblem(subjectPack, problemIdOrProblem);
  const renderer = subjectPack.workspaceRenderers[problem.workspace.kind];

  if (!renderer) {
    return freezeJson({
      contractVersion: subjectPack.contractVersion,
      rendererId: 'core.generic-workspace',
      problemId: problem.id,
      kind: problem.workspace.kind,
      state: problem.workspace.state,
      capabilities: problem.interactionModes,
    });
  }

  const descriptor = renderer({ problem, context, subjectPack });
  assertPlainObject(descriptor, 'workspace descriptor');
  assertJsonValue(descriptor, 'workspace descriptor');

  return freezeJson({
    contractVersion: subjectPack.contractVersion,
    rendererId: `${subjectPack.id}.${problem.workspace.kind}`,
    problemId: problem.id,
    kind: problem.workspace.kind,
    ...descriptor,
  });
}

function resolveProblem(subjectPack, problemIdOrProblem) {
  if (typeof problemIdOrProblem === 'string') {
    const problem = findProblem(subjectPack, problemIdOrProblem);
    if (!problem) {
      throw new RangeError(`problemId ${problemIdOrProblem} does not exist in subject pack ${subjectPack.id}`);
    }
    return problem;
  }

  assertPackContract(problemIdOrProblem, 'problem', subjectPack.subject, subjectPack.contractVersion);
  return problemIdOrProblem;
}

function assertSubjectPack(value) {
  assertPlainObject(value, 'subjectPack');
  assertNonEmptyString(value.id, 'subjectPack.id');
  assertEnum(value.subject, SUPPORTED_SUBJECTS, 'subjectPack.subject');
  assertArray(value.objectives, 'subjectPack.objectives');
  assertArray(value.problems, 'subjectPack.problems');
  assertFunctionMap(value.evaluators, 'subjectPack.evaluators');
  assertFunctionMap(value.workspaceRenderers, 'subjectPack.workspaceRenderers');
}

function assertPackContract(contract, fieldName, subject, contractVersion) {
  assertPlainObject(contract, fieldName);
  assertNonEmptyString(contract.id, `${fieldName}.id`);
  if (contract.contractVersion !== contractVersion) {
    throw new RangeError(`${fieldName}.contractVersion must match subject pack contractVersion`);
  }
  if (contract.subject !== subject) {
    throw new RangeError(`${fieldName}.subject must match subject pack subject`);
  }
}

function assertUniqueId(ids, id, fieldName) {
  if (ids.has(id)) {
    throw new RangeError(`${fieldName} must be unique within the subject pack`);
  }
  ids.add(id);
}

function assertFunctionMap(value, fieldName) {
  assertPlainObject(value, fieldName);
  Object.entries(value).forEach(([key, item]) => {
    if (typeof item !== 'function') {
      throw new TypeError(`${fieldName}.${key} must be a function`);
    }
  });
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array`);
  }
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be a plain object`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
}

function assertEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new RangeError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }
}

function freezeArrayCopy(items) {
  return Object.freeze(items.map((item) => freezeJson(item)));
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

function freezeJson(value) {
  assertJsonValue(value, 'value');
  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
