import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createInitialLearningSession } from '../src/app/learning-session.js';
import {
  createSyntheticModelGateway,
  generateSyntheticTutorResponse,
} from '../src/app/model-gateway.js';
import { createTutorContext } from '../src/app/tutor-context.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const learnerProfile = readJson('examples/shared/learner.learner-profile.json');
const consentRecord = readJson('examples/safety/guardian-consent.consent-record.json');
const safetyPolicy = readJson('examples/safety/minor.safety-policy.json');
const tutorResponseSchema = readJson('schemas/tutor-response.schema.json');
const fixedNow = () => '2026-05-30T00:00:00.000Z';

test('synthetic model gateway creates schema-compatible tutor responses from synthetic contexts', () => {
  const gateway = createSyntheticModelGateway({ now: fixedNow });
  const tutorContext = createSyntheticContext();

  const result = gateway.generateTutorResponse(tutorContext, { requestId: 'model_gateway_test_001' });

  assert.equal(result.mode, 'synthetic_only');
  assert.equal(result.metadata.syntheticOnly, true);
  assert.equal(result.metadata.retainedPrompt, false);
  assert.equal(result.safetyEvaluation.allowed, true);
  assert.equal(result.tutorResponse.safety.syntheticOnly, true);
  assert.equal(result.tutorResponse.nextAction, 'continue');
  assert.deepEqual(validateJsonSchema(result.tutorResponse, tutorResponseSchema), []);
});

test('synthetic model gateway refuses non-synthetic tutor contexts', () => {
  const tutorContext = createSyntheticContext({ metadata: {} });

  assert.throws(
    () => generateSyntheticTutorResponse({ tutorContext, now: fixedNow }),
    /metadata\.dataMode to equal "synthetic"/,
  );
});

test('synthetic model gateway emits a safety redirect when policy checks fail', () => {
  const tutorContext = createSyntheticContext();

  const result = generateSyntheticTutorResponse({
    tutorContext,
    now: fixedNow,
    requestId: 'model_gateway_test_blocked_001',
    detectedContentCategories: ['unsafe_advice'],
  });

  assert.equal(result.safetyEvaluation.allowed, false);
  assert.ok(result.safetyEvaluation.blockedReasons.includes('blocked_content_category:unsafe_advice'));
  assert.equal(result.tutorResponse.feedbackType, 'safety_redirect');
  assert.equal(result.tutorResponse.nextAction, 'handoff');
  assert.deepEqual(validateJsonSchema(result.tutorResponse, tutorResponseSchema), []);
});

function createSyntheticContext({ metadata = { dataMode: 'synthetic', purpose: 'model-gateway-test' } } = {}) {
  const session = createInitialLearningSession({
    sessionId: 'ses_model_gateway_001',
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
    generatedAt: fixedNow(),
    metadata,
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
