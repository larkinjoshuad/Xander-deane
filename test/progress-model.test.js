import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkWorkspaceAnswer, createInitialLearningSession } from '../src/app/learning-session.js';
import {
  createInitialSkillMastery,
  createSkillMastery,
  createProgressSummary,
  summarizeSkillMastery,
  updateSkillMasteryFromEvaluation,
} from '../src/app/progress-model.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const skillMasterySchema = readJson('schemas/skill-mastery.schema.json');
const progressSummarySchema = readJson('schemas/progress-summary.schema.json');
const fixedNow = () => '2026-05-28T00:00:00.000Z';

test('creates schema-compatible initial skill mastery records', () => {
  const mastery = createInitialSkillMastery({ learnerId: 'learner_demo_001', objective, now: fixedNow });

  assert.deepEqual(validateJsonSchema(mastery, skillMasterySchema), []);
  assert.equal(mastery.masteryLevel, 'not_started');
  assert.equal(mastery.masteryEstimate, 0);
  assert.equal(mastery.confidence, 'low');
  assert.ok(Object.isFrozen(mastery));
});

test('updates mastery from learning-session evaluations', () => {
  const initialMastery = createInitialSkillMastery({ learnerId: 'learner_demo_001', objective, now: fixedNow });
  const session = createInitialLearningSession({
    sessionId: 'ses_progress_001',
    learnerId: 'learner_demo_001',
    objective,
    problem,
    now: fixedNow,
  });
  const checkedSession = checkWorkspaceAnswer(session, fixedNow);
  const updatedMastery = updateSkillMasteryFromEvaluation(initialMastery, {
    session: checkedSession,
    evaluation: checkedSession.evaluation,
    now: fixedNow,
  });

  assert.deepEqual(validateJsonSchema(updatedMastery, skillMasterySchema), []);
  assert.equal(updatedMastery.attemptCount, 1);
  assert.equal(updatedMastery.correctCount, 0);
  assert.equal(updatedMastery.masteryLevel, 'emerging');
  assert.equal(updatedMastery.evidence[0].evaluationResultId, checkedSession.evaluation.id);
});

test('summarizes mastery for parent and educator dashboards', () => {
  const mastery = createSkillMastery({
    id: 'mastery_summary_001',
    learnerId: 'learner_demo_001',
    objectiveId: objective.id,
    subject: objective.subject,
    attemptCount: 4,
    correctCount: 3,
    lastAttemptAt: fixedNow(),
    lastUpdatedAt: fixedNow(),
    evidence: [sampleEvidence({ isCorrect: true })],
    recommendedNextObjectiveIds: ['math.multiplication.arrays'],
  });

  assert.deepEqual(summarizeSkillMastery(mastery), {
    objectiveId: objective.id,
    subject: objective.subject,
    attemptCount: 4,
    correctCount: 3,
    masteryEstimate: 0.75,
    masteryLevel: 'proficient',
    confidence: 'medium',
    needsPractice: false,
    readyToAdvance: true,
    recommendedNextObjectiveIds: ['math.multiplication.arrays'],
  });
});


test('aggregates skill mastery records into dashboard progress summaries', () => {
  const developing = createSkillMastery({
    id: 'mastery_developing_001',
    learnerId: 'learner_demo_001',
    objectiveId: objective.id,
    subject: objective.subject,
    attemptCount: 2,
    correctCount: 1,
    lastAttemptAt: fixedNow(),
    lastUpdatedAt: fixedNow(),
    evidence: [sampleEvidence({ isCorrect: false }), sampleEvidence({ isCorrect: true })],
    recommendedNextObjectiveIds: ['math.multiplication.arrays'],
  });
  const proficient = createSkillMastery({
    id: 'mastery_proficient_001',
    learnerId: 'learner_demo_001',
    objectiveId: 'language.verbs.action',
    subject: 'language',
    attemptCount: 4,
    correctCount: 4,
    lastAttemptAt: fixedNow(),
    lastUpdatedAt: fixedNow(),
    evidence: [sampleEvidence({ isCorrect: true, problemId: 'language.action-verb.find' })],
    recommendedNextObjectiveIds: ['language.verbs.tense'],
  });

  const summary = createProgressSummary({
    id: 'progress_learner_demo_001',
    learnerId: 'learner_demo_001',
    skillMasteries: [developing, proficient],
    generatedAt: fixedNow(),
  });

  assert.deepEqual(validateJsonSchema(summary, progressSummarySchema), []);
  assert.deepEqual(summary.totals, {
    objectiveCount: 2,
    attemptCount: 6,
    correctCount: 5,
    averageMasteryEstimate: 0.75,
    readyToAdvanceCount: 1,
    needsPracticeCount: 1,
  });
  assert.deepEqual(
    summary.subjectSummaries.map((subject) => [subject.subject, subject.objectiveCount, subject.averageMasteryEstimate]),
    [['language', 1, 1], ['math', 1, 0.5]],
  );
  assert.deepEqual(
    summary.recommendations.map((recommendation) => [recommendation.type, recommendation.objectiveId, recommendation.priority]),
    [['advance', 'language.verbs.tense', 'medium'], ['practice', objective.id, 'medium']],
  );
});

test('rejects progress summaries that mix learners', () => {
  const left = createInitialSkillMastery({ learnerId: 'learner_a', objective, now: fixedNow });
  const right = createInitialSkillMastery({ learnerId: 'learner_b', objective: { ...objective, id: 'math.other' }, now: fixedNow });

  assert.throws(
    () => createProgressSummary({ id: 'bad_progress', skillMasteries: [left, right], generatedAt: fixedNow() }),
    /skillMasteries must belong to the same learner/,
  );
});


test('rejects mismatched objective updates and impossible counts', () => {
  assert.throws(
    () => createSkillMastery({
      id: 'bad_mastery',
      learnerId: 'learner_demo_001',
      objectiveId: objective.id,
      subject: objective.subject,
      attemptCount: 1,
      correctCount: 2,
      lastUpdatedAt: fixedNow(),
      evidence: [],
    }),
    /correctCount cannot exceed attemptCount/,
  );

  const mastery = createInitialSkillMastery({ learnerId: 'learner_demo_001', objective, now: fixedNow });
  const session = createInitialLearningSession({ objective, problem, now: fixedNow });
  const checkedSession = checkWorkspaceAnswer(session, fixedNow);
  const mismatchedSession = {
    ...checkedSession,
    problem: { ...checkedSession.problem, objectiveId: 'math.other' },
  };

  assert.throws(
    () => updateSkillMasteryFromEvaluation(mastery, { session: mismatchedSession, evaluation: checkedSession.evaluation, now: fixedNow }),
    /evaluation objective does not match/,
  );
});

function sampleEvidence({ isCorrect, problemId = problem.id }) {
  return {
    sessionId: 'ses_demo_math_001',
    problemId,
    evaluationResultId: isCorrect ? 'eval_math_correct_001' : 'eval_math_incorrect_001',
    isCorrect,
    feedbackCode: isCorrect ? 'correct' : 'incorrect_group_size',
    attemptedAt: fixedNow(),
    metadata: {},
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
