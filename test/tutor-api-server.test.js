import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createInitialLearningSession } from '../src/app/learning-session.js';
import { createTutorGateway } from '../src/app/model-gateway-claude.js';
import { createTutorApiServer } from '../src/app/tutor-api-server.js';
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
  messageText: 'Try one group at a time.',
  speechText: 'Try one group at a time.',
  nextAction: 'retry',
  highlightTargets: ['group_1'],
  answerRevealed: false,
  confidence: 'medium',
});

test('handleTutorRespond turns a posted session into a schema-valid tutor response', async () => {
  const { handleTutorRespond } = createServerForTest();
  const payload = await handleTutorRespond({ session: buildSession() });

  assert.equal(payload.mode, 'live_model');
  assert.equal(payload.tutorResponse.messageText, SAMPLE_TEACHING.messageText);
  assert.deepEqual(validateJsonSchema(payload.tutorResponse, tutorResponseSchema), []);
});

test('handleTutorRespond rejects a request without a session', async () => {
  const { handleTutorRespond } = createServerForTest();
  await assert.rejects(() => handleTutorRespond({}), /session/);
});

test('handleTutorRespond falls back to synthetic when no key or client is configured', async () => {
  const { handleTutorRespond } = createServerForTest({
    gateway: createTutorGateway({ apiKey: null, client: null, now: fixedNow }),
  });
  const payload = await handleTutorRespond({ session: buildSession() });

  assert.equal(payload.mode, 'synthetic_only');
  assert.deepEqual(validateJsonSchema(payload.tutorResponse, tutorResponseSchema), []);
});

test('POST /tutor/respond serves a tutor response with permissive CORS', async () => {
  const { server } = createServerForTest();
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/tutor/respond`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: buildSession() }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    const data = await response.json();
    assert.equal(data.mode, 'live_model');
    assert.deepEqual(validateJsonSchema(data.tutorResponse, tutorResponseSchema), []);
  } finally {
    await close(server);
  }
});

test('GET /healthz reports the active gateway mode', async () => {
  const { server } = createServerForTest();
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    const data = await response.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.mode, 'live_model');
  } finally {
    await close(server);
  }
});

function createServerForTest({ gateway } = {}) {
  return createTutorApiServer({
    gateway: gateway ?? createTutorGateway({ client: createMockClient(SAMPLE_TEACHING), now: fixedNow }),
    learnerProfile,
    consentRecord,
    safetyPolicy,
    now: fixedNow,
  });
}

function createMockClient(teaching) {
  return { messages: { parse: async () => ({ parsed_output: teaching }) } };
}

function buildSession() {
  // Round-trip through JSON to mirror what the browser actually posts.
  return JSON.parse(JSON.stringify(createInitialLearningSession({ objective, problem, now: fixedNow })));
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
