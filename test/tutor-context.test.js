import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  checkWorkspaceAnswer,
  createInitialLearningSession,
} from '../src/app/learning-session.js';
import {
  createProgressSummary,
  createSkillMastery,
} from '../src/app/progress-model.js';
import {
  createTutorContext,
  summarizeTutorContext,
} from '../src/app/tutor-context.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const learnerProfile = readJson('examples/shared/learner.learner-profile.json');
const deviceProfile = readJson('examples/shared/device.device-profile.json');
const tutorContextSchema = readJson('schemas/tutor-context.schema.json');
const consentRecord = readJson('examples/safety/guardian-consent.consent-record.json');
const safetyPolicy = readJson('examples/safety/minor.safety-policy.json');
const fixedNow = () => '2026-05-29T00:00:00.000Z';

test('creates schema-compatible tutor context with progress state', () => {
  const session = checkWorkspaceAnswer(createInitialLearningSession({
    sessionId: 'ses_tutor_context_001',
    learnerId: learnerProfile.id,
    objective,
    problem,
    now: fixedNow,
  }), fixedNow);
  const skillMastery = createSkillMastery({
    id: 'mastery_tutor_context_001',
    learnerId: learnerProfile.id,
    objectiveId: objective.id,
    subject: objective.subject,
    attemptCount: 2,
    correctCount: 1,
    lastAttemptAt: fixedNow(),
    lastUpdatedAt: fixedNow(),
    evidence: [{
      sessionId: session.sessionId,
      problemId: problem.id,
      evaluationResultId: session.evaluation.id,
      isCorrect: session.evaluation.isCorrect,
      feedbackCode: session.evaluation.feedbackCode,
      attemptedAt: session.evaluation.evaluatedAt,
      metadata: {},
    }],
    recommendedNextObjectiveIds: ['math.multiplication.arrays'],
  });
  const progressSummary = createProgressSummary({
    id: 'progress_tutor_context_001',
    learnerId: learnerProfile.id,
    skillMasteries: [skillMastery],
    generatedAt: fixedNow(),
  });

  const tutorContext = createTutorContext({
    session,
    learnerProfile,
    deviceProfile,
    skillMastery,
    progressSummary,
    consentRecord,
    safetyPolicy,
    maxRecentEvents: 1,
    mayCallAi: false,
    generatedAt: fixedNow(),
  });

  assert.deepEqual(validateJsonSchema(tutorContext, tutorContextSchema), []);
  assert.equal(tutorContext.recentEvents.length, 1);
  assert.equal(tutorContext.evaluationResult.id, session.evaluation.id);
  assert.equal(tutorContext.constraints.presentationMode, 'compact');
  assert.equal(tutorContext.consentSafetySummary.consentStatus, 'granted');
  assert.deepEqual(tutorContext.consentSafetySummary.activeScopes, [
    'ai_tutoring',
    'personalization',
    'progress_tracking',
    'guardian_notifications',
    'data_export',
  ]);
  assert.equal(tutorContext.consentSafetySummary.safetyPolicyId, 'safety.minor.default');
  assert.equal(tutorContext.constraints.mustValidateTutorResponse, true);
  assert.equal(tutorContext.constraints.mayCallAi, false);
});

test('summarizes tutor context for model gateway and audit logs', () => {
  const session = createInitialLearningSession({
    sessionId: 'ses_tutor_context_summary_001',
    learnerId: null,
    objective,
    problem,
    now: fixedNow,
  });
  const tutorContext = createTutorContext({
    session,
    learnerProfile,
    deviceProfile,
    consentRecord,
    safetyPolicy,
    maxRecentEvents: 5,
    mayCallAi: true,
    generatedAt: fixedNow(),
  });

  assert.deepEqual(summarizeTutorContext(tutorContext), {
    sessionId: 'ses_tutor_context_summary_001',
    learnerId: learnerProfile.id,
    objectiveId: objective.id,
    problemId: problem.id,
    eventCount: 1,
    hasEvaluation: false,
    hasSkillMastery: false,
    hasProgressSummary: false,
    consentStatus: 'granted',
    activeConsentScopes: ['ai_tutoring', 'personalization', 'progress_tracking', 'guardian_notifications', 'data_export'],
    safetyPolicyId: 'safety.minor.default',
    aiAutonomyLevel: 'guided_only',
    allowedModalities: ['text', 'audio', 'touch', 'manipulative'],
    presentationMode: 'compact',
    mayCallAi: true,
  });
});

test('rejects tutor contexts when the active objective is missing', () => {
  const session = createInitialLearningSession({ objective, problem, now: fixedNow });
  const brokenSession = {
    ...session,
    subjectPack: {
      ...session.subjectPack,
      objectives: [],
    },
  };

  assert.throws(
    () => createTutorContext({ session: brokenSession, generatedAt: fixedNow() }),
    /does not contain the active problem objective/,
  );
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
