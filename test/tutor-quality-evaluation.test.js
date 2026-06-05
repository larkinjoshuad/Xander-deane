import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createInitialLearningSession } from '../src/app/learning-session.js';
import { generateSyntheticTutorResponse } from '../src/app/model-gateway.js';
import {
  compareTutorQualityScorecards,
  createTutorQualityScorecard,
} from '../src/app/tutor-quality-evaluation.js';
import { createTutorContext } from '../src/app/tutor-context.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const learnerProfile = readJson('examples/shared/learner.learner-profile.json');
const consentRecord = readJson('examples/safety/guardian-consent.consent-record.json');
const safetyPolicy = readJson('examples/safety/minor.safety-policy.json');
const tutorResponseSchema = readJson('schemas/tutor-response.schema.json');
const scorecardSchema = readJson('schemas/tutor-quality-scorecard.schema.json');
const fixedAt = '2026-06-04T00:00:00.000Z';
const fixedNow = () => fixedAt;

test('creates schema-compatible tutor quality scorecards for synthetic gateway responses', () => {
  const tutorContext = createSyntheticContext();
  const gatewayResult = generateSyntheticTutorResponse({
    tutorContext,
    now: fixedNow,
    requestId: 'model_quality_scorecard_001',
  });
  const schemaValidationErrors = validateJsonSchema(gatewayResult.tutorResponse, tutorResponseSchema);

  const scorecard = createTutorQualityScorecard({
    tutorContext,
    tutorResponse: gatewayResult.tutorResponse,
    safetyEvaluation: gatewayResult.safetyEvaluation,
    schemaValidationErrors,
    deterministicTutorResponse: createDeterministicTutorResponse(tutorContext),
    evaluatedAt: fixedAt,
  });

  assert.equal(scorecard.mode, 'synthetic_tutor_quality');
  assert.equal(scorecard.passed, true);
  assert.equal(scorecard.totalScore, scorecard.maxScore);
  assert.deepEqual(scorecard.issues, []);
  assert.deepEqual(validateJsonSchema(scorecard, scorecardSchema), []);
});

test('tutor quality scorecards fail when responses reveal answers under constrained policy', () => {
  const tutorContext = createSyntheticContext();
  const unsafeResponse = {
    ...createDeterministicTutorResponse(tutorContext),
    id: 'msg_quality_bad_answer_reveal_001',
    messageText: 'The answer is 12. Just type 12.',
    speechText: 'The answer is 12. Just type 12.',
    feedbackType: 'explanation',
    nextAction: 'advance',
    safety: {
      answerRevealed: false,
      confidence: 'high',
    },
  };

  const scorecard = createTutorQualityScorecard({
    tutorContext,
    tutorResponse: unsafeResponse,
    schemaValidationErrors: validateJsonSchema(unsafeResponse, tutorResponseSchema),
    evaluatedAt: fixedAt,
  });

  assert.equal(scorecard.passed, false);
  assert.ok(scorecard.issues.some((issue) => issue.includes('reveal')));
  assert.ok(scorecard.totalScore < scorecard.maxScore);
});

test('compares baseline and candidate tutor quality scorecards', () => {
  const tutorContext = createSyntheticContext();
  const baseline = createTutorQualityScorecard({
    tutorContext,
    tutorResponse: createDeterministicTutorResponse(tutorContext),
    evaluatedAt: fixedAt,
  });
  const candidateResponse = {
    ...createDeterministicTutorResponse(tutorContext),
    id: 'msg_quality_candidate_001',
    messageText: 'Let us solve this step by step. Explain what the groups show, then check one group at a time.',
    speechText: 'Let us solve this step by step. Explain what the groups show, then check one group at a time.',
  };
  const candidate = createTutorQualityScorecard({
    tutorContext,
    tutorResponse: candidateResponse,
    evaluatedAt: fixedAt,
  });

  const comparison = compareTutorQualityScorecards({ baselineScorecard: baseline, candidateScorecard: candidate });

  assert.equal(comparison.winner, candidate.totalScore > baseline.totalScore ? 'candidate' : candidate.totalScore < baseline.totalScore ? 'baseline' : 'tie');
  assert.equal(comparison.scoreDelta, candidate.totalScore - baseline.totalScore);
  assert.equal(typeof comparison.rubricDeltas.pedagogy, 'number');
});

function createSyntheticContext() {
  const session = createInitialLearningSession({
    sessionId: 'ses_tutor_quality_001',
    learnerId: learnerProfile.id,
    objective,
    problem,
    now: fixedNow,
  });
  return createTutorContext({
    session,
    learnerProfile,
    consentRecord,
    safetyPolicy,
    mayCallAi: true,
    generatedAt: fixedAt,
    metadata: { dataMode: 'synthetic', purpose: 'tutor-quality-scorecard-test' },
  });
}

function createDeterministicTutorResponse(tutorContext) {
  return {
    contractVersion: tutorContext.contractVersion,
    id: `deterministic_${tutorContext.id}`,
    sessionId: tutorContext.sessionId,
    problemId: tutorContext.problemId,
    locale: tutorContext.problem.locale ?? tutorContext.objective.locale ?? 'en-US',
    feedbackType: 'hint',
    messageText: 'Look at the workspace and check one group at a time before trying again.',
    speechText: 'Look at the workspace and check one group at a time before trying again.',
    nextAction: 'continue',
    highlightTargets: [],
    safety: {
      answerRevealed: false,
      confidence: 'high',
    },
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
