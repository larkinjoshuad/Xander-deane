import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  checkWorkspaceAnswer,
  createInitialLearningSession,
  placeSelectedCounter,
  placeSelectedSortItem,
  resetWorkspace,
  selectCounter,
  selectSortItem,
  selectToken,
  workspaceSnapshotToAnswer,
} from '../src/app/learning-session.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const languageObjective = readJson('examples/language/objective.learning-objective.json');
const languageProblem = readJson('examples/language/problem.problem.json');
const scienceObjective = readJson('examples/science/objective.learning-objective.json');
const scienceProblem = readJson('examples/science/problem.problem.json');
const fixedNow = () => '2026-05-28T00:00:00.000Z';
const workspaceSnapshotSchema = readJson('schemas/workspace-snapshot.schema.json');
const tutorPolicySchema = readJson('schemas/tutor-policy.schema.json');
const evaluationResultSchema = readJson('schemas/evaluation-result.schema.json');

test('creates a UI-ready learning session from schema fixtures', () => {
  const session = createInitialLearningSession({ objective, problem, now: fixedNow });

  assert.equal(session.workspaceDescriptor.component, 'EqualGroupsWorkspace');
  assert.equal(session.workspaceSnapshot.state.counters.length, 12);
  assert.equal(session.workspaceSnapshot.state.groups.length, 3);
  assert.equal(session.events[0].type, 'problem_presented');
  assert.equal(session.tutorResponse.feedbackType, 'question');
  assert.deepEqual(validateJsonSchema(session.workspaceSnapshot, workspaceSnapshotSchema), []);
  assert.deepEqual(validateJsonSchema(session.tutorPolicy, tutorPolicySchema), []);
});

test('moves selected counters into groups and records interaction events', () => {
  let session = createInitialLearningSession({ objective, problem, now: fixedNow });

  session = selectCounter(session, 'counter_1');
  session = placeSelectedCounter(session, 'group_1', fixedNow);

  assert.equal(session.selectedCounterId, null);
  assert.deepEqual(session.workspaceSnapshot.state.groups[0].items, ['counter_1']);
  assert.equal(session.events.at(-1).type, 'user_dragged');
  assert.deepEqual(session.events.at(-1).payload, {
    counterId: 'counter_1',
    to: 'group_1',
    workspaceSnapshotId: session.workspaceSnapshot.id,
  });
});

test('evaluates an incomplete workspace and returns guided tutor feedback', () => {
  let session = createInitialLearningSession({ objective, problem, now: fixedNow });
  session = selectCounter(session, 'counter_1');
  session = placeSelectedCounter(session, 'group_1', fixedNow);
  session = checkWorkspaceAnswer(session, fixedNow);

  assert.equal(session.evaluation.isCorrect, false);
  assert.deepEqual(validateJsonSchema(session.evaluation, evaluationResultSchema), []);
  assert.equal(session.tutorResponse.feedbackType, 'hint');
  assert.equal(session.tutorResponse.nextAction, 'retry');
  assert.equal(session.events.at(-1).type, 'answer_checked');
});

test('evaluates a complete equal-groups workspace as correct', () => {
  let session = createInitialLearningSession({ objective, problem, now: fixedNow });
  const placements = [
    ['counter_1', 'group_1'],
    ['counter_2', 'group_1'],
    ['counter_3', 'group_1'],
    ['counter_4', 'group_1'],
    ['counter_5', 'group_2'],
    ['counter_6', 'group_2'],
    ['counter_7', 'group_2'],
    ['counter_8', 'group_2'],
    ['counter_9', 'group_3'],
    ['counter_10', 'group_3'],
    ['counter_11', 'group_3'],
    ['counter_12', 'group_3'],
  ];

  placements.forEach(([counterId, groupId]) => {
    session = selectCounter(session, counterId);
    session = placeSelectedCounter(session, groupId, fixedNow);
  });
  session = checkWorkspaceAnswer(session, fixedNow);

  assert.equal(session.evaluation.isCorrect, true);
  assert.equal(session.evaluation.diagnostics.totalCounters, 12);
  assert.deepEqual(session.evaluation.diagnostics.groupSizes, [4, 4, 4]);
  assert.equal(session.tutorResponse.feedbackType, 'summary');
  assert.equal(session.tutorResponse.nextAction, 'advance');
});



test('creates and evaluates a language token-selection session', () => {
  let session = createInitialLearningSession({
    objective: languageObjective,
    problem: languageProblem,
    now: fixedNow,
  });

  assert.equal(session.workspaceDescriptor.component, 'TokenSelectionWorkspace');
  assert.equal(session.workspaceSnapshot.kind, 'token-selection');
  assert.deepEqual(validateJsonSchema(session.workspaceSnapshot, workspaceSnapshotSchema), []);
  assert.deepEqual(validateJsonSchema(session.tutorPolicy, tutorPolicySchema), []);

  session = selectToken(session, 2, fixedNow);
  session = checkWorkspaceAnswer(session, fixedNow);

  assert.equal(session.evaluation.isCorrect, true);
  assert.equal(session.evaluation.diagnostics.selectedToken, 'runs');
  assert.equal(session.evaluation.diagnostics.selectedTokenIndex, 2);
  assert.deepEqual(validateJsonSchema(session.evaluation, evaluationResultSchema), []);
  assert.equal(session.tutorResponse.feedbackType, 'summary');
});

test('returns guided language feedback for an incorrect token selection', () => {
  let session = createInitialLearningSession({
    objective: languageObjective,
    problem: languageProblem,
    now: fixedNow,
  });

  session = selectToken(session, 1, fixedNow);
  session = checkWorkspaceAnswer(session, fixedNow);

  assert.equal(session.evaluation.isCorrect, false);
  assert.equal(session.evaluation.diagnostics.selectedToken, 'dog');
  assert.equal(session.tutorResponse.feedbackType, 'hint');
  assert.equal(session.tutorResponse.nextAction, 'retry');
  assert.equal(session.events.at(-1).payload.selectedToken, 'dog');
  assert.equal(session.events.at(-2).payload.selectedToken, 'dog');
});


test('creates and evaluates a science classification-sort session', () => {
  let session = createInitialLearningSession({
    objective: scienceObjective,
    problem: scienceProblem,
    now: fixedNow,
  });

  assert.equal(session.workspaceDescriptor.component, 'ClassificationSortWorkspace');
  assert.equal(session.workspaceSnapshot.kind, 'classification-sort');
  assert.deepEqual(validateJsonSchema(session.workspaceSnapshot, workspaceSnapshotSchema), []);
  assert.deepEqual(validateJsonSchema(session.tutorPolicy, tutorPolicySchema), []);

  session = selectSortItem(session, 'duck');
  session = placeSelectedSortItem(session, 'feathers', fixedNow);
  session = selectSortItem(session, 'eagle');
  session = placeSelectedSortItem(session, 'feathers', fixedNow);
  session = checkWorkspaceAnswer(session, fixedNow);

  assert.equal(session.evaluation.isCorrect, true);
  assert.equal(session.evaluation.diagnostics.targetGroup, 'feathers');
  assert.deepEqual(session.evaluation.diagnostics.sortedItems, ['duck', 'eagle']);
  assert.deepEqual(session.evaluation.diagnostics.missingItems, []);
  assert.deepEqual(validateJsonSchema(session.evaluation, evaluationResultSchema), []);
  assert.equal(session.tutorResponse.feedbackType, 'summary');
});

test('returns guided science feedback for misplaced classification items', () => {
  let session = createInitialLearningSession({
    objective: scienceObjective,
    problem: scienceProblem,
    now: fixedNow,
  });

  session = selectSortItem(session, 'dog');
  session = placeSelectedSortItem(session, 'feathers', fixedNow);
  session = checkWorkspaceAnswer(session, fixedNow);

  assert.equal(session.evaluation.isCorrect, false);
  assert.deepEqual(session.evaluation.diagnostics.missingItems, ['duck', 'eagle']);
  assert.deepEqual(session.evaluation.diagnostics.misplacedItems, ['dog']);
  assert.equal(session.tutorResponse.feedbackType, 'hint');
  assert.equal(session.tutorResponse.nextAction, 'retry');
  assert.equal(session.events.at(-1).payload.targetGroup, 'feathers');
  assert.equal(session.events.at(-2).payload.itemId, 'dog');
});

test('resets workspace snapshots and keeps an event audit trail', () => {
  let session = createInitialLearningSession({ objective, problem, now: fixedNow });
  session = selectCounter(session, 'counter_1');
  session = placeSelectedCounter(session, 'group_1', fixedNow);
  session = resetWorkspace(session, fixedNow);

  assert.equal(session.workspaceSnapshot.version, 1);
  assert.deepEqual(workspaceSnapshotToAnswer(session.workspaceSnapshot).groups[0].items, []);
  assert.equal(session.events.at(-1).type, 'workspace_reset');
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
