import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createInitialLearningSession } from '../src/app/learning-session.js';
import { createSyntheticModelGateway } from '../src/app/model-gateway.js';
import {
  buildTutorUserContent,
  createClaudeModelGateway,
  createTutorGateway,
} from '../src/app/model-gateway-claude.js';
import { createTutorContext } from '../src/app/tutor-context.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const learnerProfile = readJson('examples/shared/learner.learner-profile.json');
const consentRecord = readJson('examples/safety/guardian-consent.consent-record.json');
const safetyPolicy = readJson('examples/safety/minor.safety-policy.json');
const tutorResponseSchema = readJson('schemas/tutor-response.schema.json');
const fixedNow = () => '2026-05-30T00:00:00.000Z';

const SAMPLE_TEACHING = Object.freeze({
  feedbackType: 'hint',
  messageText: 'Try counting one group at a time.',
  speechText: 'Try counting one group at a time.',
  nextAction: 'retry',
  highlightTargets: ['group_1'],
  answerRevealed: false,
  confidence: 'medium',
});

test('claude gateway maps model output into a schema-valid, safety-checked tutor response', async () => {
  let captured = null;
  const gateway = createClaudeModelGateway({
    client: createMockClient(SAMPLE_TEACHING, { onRequest: (req) => { captured = req; } }),
    now: fixedNow,
  });

  const result = await gateway.generateTutorResponse(createSyntheticContext(), {
    requestId: 'claude_gateway_test_001',
  });

  assert.equal(result.mode, 'live_model');
  assert.equal(result.metadata.syntheticOnly, false);
  assert.equal(result.metadata.provider, 'anthropic:claude-opus-4-7');
  assert.equal(result.metadata.retainedPrompt, false);
  assert.equal(result.tutorResponse.feedbackType, 'hint');
  assert.equal(result.tutorResponse.nextAction, 'retry');
  assert.equal(result.tutorResponse.messageText, SAMPLE_TEACHING.messageText);
  assert.equal(result.tutorResponse.safety.syntheticOnly, false);
  assert.deepEqual(validateJsonSchema(result.tutorResponse, tutorResponseSchema), []);

  // Request shape: default model, cached stable system prompt, structured output.
  assert.equal(captured.model, 'claude-opus-4-7');
  assert.equal(captured.system[0].cache_control.type, 'ephemeral');
  assert.equal(captured.output_config.format.type, 'json_schema');
  assert.match(captured.messages[0].content, /Build 3 groups of 4 counters/);
});

test('claude gateway still enforces the safety pipeline on model output', async () => {
  const gateway = createClaudeModelGateway({
    client: createMockClient(SAMPLE_TEACHING),
    now: fixedNow,
  });

  const result = await gateway.generateTutorResponse(createSyntheticContext(), {
    requestId: 'claude_gateway_test_blocked_001',
    detectedContentCategories: ['unsafe_advice'],
  });

  assert.equal(result.safetyEvaluation.allowed, false);
  assert.equal(result.tutorResponse.feedbackType, 'safety_redirect');
  assert.equal(result.tutorResponse.nextAction, 'handoff');
  assert.equal(result.tutorResponse.safety.syntheticOnly, false);
  assert.deepEqual(validateJsonSchema(result.tutorResponse, tutorResponseSchema), []);
});

test('claude gateway falls back to the synthetic gateway when the model call fails', async () => {
  const failingClient = {
    messages: { parse: async () => { throw new Error('simulated API outage'); } },
  };
  const gateway = createClaudeModelGateway({
    client: failingClient,
    now: fixedNow,
    fallbackGateway: createSyntheticModelGateway({ now: fixedNow }),
  });

  const result = await gateway.generateTutorResponse(createSyntheticContext(), {
    requestId: 'claude_gateway_test_fallback_001',
  });

  assert.equal(result.mode, 'synthetic_only');
  assert.equal(result.metadata.syntheticOnly, true);
  assert.deepEqual(validateJsonSchema(result.tutorResponse, tutorResponseSchema), []);
});

test('createTutorGateway returns the synthetic gateway when no client or key is available', async () => {
  const gateway = createTutorGateway({ apiKey: null, client: null, now: fixedNow });
  const result = await gateway.generateTutorResponse(createSyntheticContext(), {
    requestId: 'tutor_gateway_no_key_001',
  });
  assert.equal(result.mode, 'synthetic_only');
});

test('createTutorGateway uses the Claude gateway when a client is injected', async () => {
  const gateway = createTutorGateway({
    client: createMockClient(SAMPLE_TEACHING),
    now: fixedNow,
  });
  const result = await gateway.generateTutorResponse(createSyntheticContext(), {
    requestId: 'tutor_gateway_client_001',
  });
  assert.equal(result.mode, 'live_model');
});

test('user content reflects reveal permission and problem context', () => {
  const content = buildTutorUserContent(createSyntheticContext());
  assert.match(content, /May reveal answer: false/);
  assert.match(content, /Build 3 groups of 4 counters/);
});

function createMockClient(teaching, { onRequest } = {}) {
  return {
    messages: {
      parse: async (request) => {
        if (onRequest) onRequest(request);
        return { parsed_output: teaching, usage: { input_tokens: 10, output_tokens: 20 } };
      },
    },
  };
}

function createSyntheticContext({ metadata = { dataMode: 'synthetic', purpose: 'claude-gateway-test' } } = {}) {
  const session = createInitialLearningSession({
    sessionId: 'ses_claude_gateway_001',
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
