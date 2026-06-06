import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createSubjectPack,
  createWorkspaceDescriptor,
  evaluateSubjectProblem,
  findProblem,
} from '../src/core/subject-pack.js';

const mathObjective = readJson('examples/math/objective.learning-objective.json');
const mathProblem = readJson('examples/math/problem.problem.json');

test('creates subject packs from schema-backed objectives and problems', () => {
  const pack = createSubjectPack({
    id: 'math.equal-groups.pack',
    subject: 'math',
    objectives: [mathObjective],
    problems: [mathProblem],
  });

  assert.equal(pack.id, 'math.equal-groups.pack');
  assert.equal(findProblem(pack, 'math.3x4.visual-groups')?.id, mathProblem.id);
  assert.throws(() => {
    pack.problems.push(mathProblem);
  }, TypeError);
});

test('uses deterministic subject-pack evaluators when a workspace kind has one', () => {
  const pack = createSubjectPack({
    id: 'math.equal-groups.pack',
    subject: 'math',
    objectives: [mathObjective],
    problems: [mathProblem],
    evaluators: {
      'equal-groups': ({ problem, answer }) => {
        const groups = answer.groups ?? [];
        const expectedGroupCount = problem.workspace.state.groupsRequired;
        const expectedItemsPerGroup = problem.workspace.state.itemsPerGroup;
        const groupSizes = groups.map((group) => group.items.length);
        const isCorrect =
          groupSizes.length === expectedGroupCount &&
          groupSizes.every((groupSize) => groupSize === expectedItemsPerGroup);

        return {
          isCorrect,
          submittedAnswer: answer,
          groupSizes,
        };
      },
    },
  });

  const result = evaluateSubjectProblem(pack, mathProblem.id, {
    groups: [
      { id: 'group_1', items: ['counter_1', 'counter_2', 'counter_3', 'counter_4'] },
      { id: 'group_2', items: ['counter_5', 'counter_6', 'counter_7', 'counter_8'] },
      { id: 'group_3', items: ['counter_9', 'counter_10', 'counter_11', 'counter_12'] },
    ],
  });

  assert.equal(result.isCorrect, true);
  assert.equal(result.feedbackCode, 'correct');
  assert.equal(result.evaluatorId, 'math.equal-groups.pack.equal-groups');
});

test('falls back to core answer evaluation when no subject evaluator exists', () => {
  const pack = createSubjectPack({
    id: 'math.equal-groups.pack',
    subject: 'math',
    objectives: [mathObjective],
    problems: [mathProblem],
  });

  const result = evaluateSubjectProblem(pack, mathProblem.id, 'twelve');

  assert.equal(result.isCorrect, true);
  assert.equal(result.evaluatorId, 'core.evaluateAnswer');
});

test('creates serializable workspace descriptors for UI shells', () => {
  const pack = createSubjectPack({
    id: 'math.equal-groups.pack',
    subject: 'math',
    objectives: [mathObjective],
    problems: [mathProblem],
    workspaceRenderers: {
      'equal-groups': ({ problem }) => ({
        component: 'EqualGroupsWorkspace',
        props: {
          prompt: problem.prompt,
          groupsRequired: problem.workspace.state.groupsRequired,
          itemsPerGroup: problem.workspace.state.itemsPerGroup,
        },
      }),
    },
  });

  const descriptor = createWorkspaceDescriptor(pack, mathProblem.id);

  assert.equal(descriptor.rendererId, 'math.equal-groups.pack.equal-groups');
  assert.equal(descriptor.component, 'EqualGroupsWorkspace');
  assert.equal(descriptor.props.groupsRequired, 3);
});

test('rejects subject packs with mismatched problem objectives', () => {
  assert.throws(() => {
    createSubjectPack({
      id: 'math.invalid.pack',
      subject: 'math',
      objectives: [mathObjective],
      problems: [{ ...mathProblem, objectiveId: 'math.unknown' }],
    });
  }, RangeError);
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
