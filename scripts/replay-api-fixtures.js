#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConsentRecord } from '../src/app/consent-safety.js';
import { createAccount, createLearnerAccountLink } from '../src/app/identity-access.js';
import {
  createInitialLearningSession,
  placeSelectedCounter,
  selectCounter,
} from '../src/app/learning-session.js';
import {
  createAccessControlledSessionService,
  createInMemoryAuditEventStore,
} from '../src/app/session-access-service.js';
import { createSessionHttpApi } from '../src/app/session-http-api.js';
import { createSessionPersistenceService } from '../src/app/session-service.js';

const REPO_ROOT = new URL('..', import.meta.url).pathname;
const API_FIXTURE_DIR = join(REPO_ROOT, 'examples/api/session-http');
const objective = readJson(join(REPO_ROOT, 'examples/math/objective.learning-objective.json'));
const problem = readJson(join(REPO_ROOT, 'examples/math/problem.problem.json'));
const fixedNow = () => '2026-05-29T00:00:00.000Z';

export async function replaySessionApiFixture(fixturePath, options = {}) {
  const fixture = readJson(fixturePath);
  const scenario = createReplayScenario(fixture, options);
  const response = await scenario.api.handleRequest(createRequestFromFixture(fixture, scenario.requestBody));
  const payload = await response.json();

  assert.equal(response.status, fixture.response.status, `${fixture.id} status`);
  assertExpectedHeaders(response, fixture.response.headers ?? {}, fixture.id);
  assertJsonSubset(payload, fixture.response.body, fixture.id);

  return Object.freeze({
    id: fixture.id,
    fixturePath,
    status: response.status,
  });
}

export async function replaySessionApiFixtures(rootDir = API_FIXTURE_DIR, options = {}) {
  const fixturePaths = readdirSync(rootDir)
    .filter((fileName) => fileName.endsWith('.api-http-exchange.json'))
    .map((fileName) => join(rootDir, fileName))
    .sort();

  const results = [];
  for (const fixturePath of fixturePaths) {
    results.push(await replaySessionApiFixture(fixturePath, options));
  }
  return Object.freeze(results);
}

function createReplayScenario(fixture, options = {}) {
  switch (fixture.id) {
    case 'api_session_create_success': {
      const { api } = createApiHarness(createGuardianContext(), options);
      return { api, requestBody: { session: createMathSession() } };
    }
    case 'api_session_append_event_conflict':
      return createAppendEventConflictScenario(options);
    case 'api_session_delete_missing_precondition':
      return createDeleteMissingPreconditionScenario(options);
    case 'api_session_create_unauthorized':
      return {
        api: createSessionHttpApi(),
        requestBody: { session: createMathSession('ses_api_fixture_unauthorized_001') },
      };
    case 'api_session_append_snapshot_success':
      return createAppendSnapshotSuccessScenario(options);
    case 'api_session_delete_versioned_success':
      return createDeleteVersionedSuccessScenario(options);
    case 'api_session_create_forbidden': {
      const { api } = createApiHarness(createGuardianContext({ permissions: ['view_progress'] }), options);
      return { api, requestBody: { session: createMathSession('ses_api_fixture_forbidden_001') } };
    }
    case 'api_session_create_malformed_json':
      return { api: createSessionHttpApi(), requestBody: undefined };
    case 'api_session_read_missing': {
      const { api } = createApiHarness(createGuardianContext(), options);
      return { api, requestBody: undefined };
    }
    default:
      throw new Error(`No replay scenario is registered for fixture ${fixture.id}`);
  }
}

function createAppendEventConflictScenario(options) {
  const { api } = createApiHarness(createGuardianContext(), options);
  const session = placeSelectedCounter(
    selectCounter(createMathSession(), 'counter_1'),
    'group_1',
    fixedNow,
  );
  return setupScenario(api, [
    createRequest('/sessions', { method: 'POST', body: { session: createMathSession() } }),
  ], { event: session.events.at(-1) });
}

function createDeleteMissingPreconditionScenario(options) {
  const { api } = createApiHarness(createGuardianContext(), options);
  return setupScenario(api, [
    createRequest('/sessions', { method: 'POST', body: { session: createMathSession() } }),
  ]);
}

function createAppendSnapshotSuccessScenario(options) {
  const { api } = createApiHarness(createGuardianContext(), options);
  const session = placeSelectedCounter(
    selectCounter(createMathSession(), 'counter_1'),
    'group_1',
    fixedNow,
  );
  return setupScenario(api, [
    createRequest('/sessions', { method: 'POST', body: { session: createMathSession() } }),
    createRequest('/sessions/ses_api_fixture_math_001/events', {
      method: 'POST',
      headers: { 'if-match': 'W/"ses_api_fixture_math_001:1"' },
      body: { event: session.events.at(-1) },
    }),
  ], { workspaceSnapshot: session.workspaceSnapshot });
}

function createDeleteVersionedSuccessScenario(options) {
  const { api } = createApiHarness(createGuardianContext(), options);
  const session = placeSelectedCounter(
    selectCounter(createMathSession(), 'counter_1'),
    'group_1',
    fixedNow,
  );
  return setupScenario(api, [
    createRequest('/sessions', { method: 'POST', body: { session: createMathSession() } }),
    createRequest('/sessions/ses_api_fixture_math_001/events', {
      method: 'POST',
      headers: { 'if-match': 'W/"ses_api_fixture_math_001:1"' },
      body: { event: session.events.at(-1) },
    }),
    createRequest('/sessions/ses_api_fixture_math_001/snapshots', {
      method: 'POST',
      headers: { 'x-record-version': '2' },
      body: { workspaceSnapshot: session.workspaceSnapshot },
    }),
  ]);
}

function setupScenario(api, setupRequests, requestBody) {
  const scenario = { api, requestBody };
  scenario.ready = setupRequests.reduce(
    (promise, request) => promise.then(() => api.handleRequest(request)),
    Promise.resolve(),
  );
  return new Proxy(scenario, {
    get(target, property) {
      if (property === 'api') {
        return {
          handleRequest: async (request) => {
            await target.ready;
            return api.handleRequest(request);
          },
        };
      }
      return target[property];
    },
  });
}

function createApiHarness(context = createGuardianContext(), { createSessionService } = {}) {
  const auditEventStore = createInMemoryAuditEventStore();
  const accessService = createAccessControlledSessionService({
    sessionService: createSessionService ? createSessionService() : createSessionPersistenceService({ now: fixedNow }),
    auditEventStore,
    now: fixedNow,
  });
  const api = createSessionHttpApi({
    accessService,
    resolveAccessContext: async ({ request }) => ({
      ...context,
      traceId: request.headers.get('x-trace-id') ?? context.traceId,
      auditEventId: request.headers.get('x-audit-event-id') ?? context.auditEventId,
    }),
  });

  return { api, accessService, auditEventStore };
}

function createGuardianContext(overrides = {}) {
  const account = createAccount({
    id: overrides.accountId ?? 'guardian_api_fixture_001',
    role: 'guardian',
    displayName: 'API Fixture Guardian',
    createdAt: fixedNow(),
  });
  const link = createLearnerAccountLink({
    id: overrides.linkId ?? 'link_api_fixture_guardian_001',
    accountId: account.id,
    learnerId: overrides.learnerId ?? 'learner_api_fixture_001',
    relationship: 'parent_guardian',
    permissions: overrides.permissions,
    createdAt: fixedNow(),
  });
  const consentRecord = createConsentRecord({
    id: overrides.consentId ?? 'consent_api_fixture_001',
    learnerId: overrides.consentLearnerId ?? link.learnerId,
    guardianId: account.id,
    grantedScopes: overrides.grantedScopes ?? ['progress_tracking', 'personalization', 'data_export'],
    collectedAt: fixedNow(),
  });

  return {
    account,
    link,
    consentRecord,
    traceId: overrides.traceId ?? 'trace_api_fixture_replay_001',
    auditEventId: overrides.auditEventId,
  };
}

function createMathSession(sessionId = 'ses_api_fixture_math_001') {
  return createInitialLearningSession({
    sessionId,
    learnerId: 'learner_api_fixture_001',
    objective,
    problem,
    now: fixedNow,
  });
}

function createRequestFromFixture(fixture, bodyOverride) {
  const body = fixture.request.rawBody ?? stringifyBody(bodyOverride ?? fixture.request.body);
  return createRequest(fixture.request.path, {
    method: fixture.request.method,
    headers: fixture.request.headers ?? {},
    body,
  });
}

function createRequest(path, { method = 'GET', body, headers = {} } = {}) {
  return new Request(`http://local.test${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: typeof body === 'string' || body === undefined ? body : JSON.stringify(body),
  });
}

function stringifyBody(body) {
  if (body === undefined) return undefined;
  return JSON.stringify(body);
}

function assertExpectedHeaders(response, expectedHeaders, fixtureId) {
  Object.entries(expectedHeaders).forEach(([name, expectedValue]) => {
    assert.equal(response.headers.get(name), expectedValue, `${fixtureId} response header ${name}`);
  });
}

function assertJsonSubset(actual, expected, path) {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path} must be an array`);
    assert.equal(actual.length, expected.length, `${path} array length`);
    expected.forEach((entry, index) => assertJsonSubset(actual[index], entry, `${path}[${index}]`));
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object' && !Array.isArray(actual), `${path} must be an object`);
    Object.entries(expected).forEach(([key, value]) => {
      assert.ok(Object.hasOwn(actual, key), `${path}.${key} is missing`);
      assertJsonSubset(actual[key], value, `${path}.${key}`);
    });
    return;
  }
  if (path.endsWith('.message') && typeof actual === 'string' && typeof expected === 'string') {
    assert.ok(actual.includes(expected), `${path} must include ${expected}`);
    return;
  }
  assert.equal(actual, expected, path);
}


function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isCliEntryPoint() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isCliEntryPoint()) {
  try {
    const results = await replaySessionApiFixtures();
    results.forEach((result) => {
      console.log(`ok ${basename(result.fixturePath)} -> ${result.status}`);
    });
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}
