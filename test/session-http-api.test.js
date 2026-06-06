import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { test } from 'node:test';
import {
  createInitialLearningSession,
  placeSelectedCounter,
  selectCounter,
} from '../src/app/learning-session.js';
import { createConsentRecord, revokeConsent } from '../src/app/consent-safety.js';
import { createAccount, createLearnerAccountLink } from '../src/app/identity-access.js';
import {
  createAccessControlledSessionService,
  createInMemoryAuditEventStore,
} from '../src/app/session-access-service.js';
import { createNodeSessionHttpHandler, createSessionHttpApi } from '../src/app/session-http-api.js';
import { createSessionPersistenceService } from '../src/app/session-service.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const dataInventory = readJson('examples/governance/base.data-inventory.json');
const retentionPolicy = readJson('examples/safety/session.data-retention-policy.json');
const fixedNow = () => '2026-05-29T00:00:00.000Z';

function createMathSession(sessionId = 'ses_http_math_001') {
  return createInitialLearningSession({
    sessionId,
    learnerId: 'learner_http_001',
    objective,
    problem,
    now: fixedNow,
  });
}

function createGuardianContext(overrides = {}) {
  const account = createAccount({
    id: overrides.accountId ?? 'guardian_http_001',
    role: 'guardian',
    displayName: 'HTTP Guardian',
    createdAt: fixedNow(),
  });
  const link = createLearnerAccountLink({
    id: overrides.linkId ?? 'link_http_guardian_001',
    accountId: account.id,
    learnerId: overrides.learnerId ?? 'learner_http_001',
    relationship: 'parent_guardian',
    permissions: overrides.permissions,
    createdAt: fixedNow(),
  });
  const consentRecord = createConsentRecord({
    id: overrides.consentId ?? 'consent_http_001',
    learnerId: overrides.consentLearnerId ?? link.learnerId,
    guardianId: account.id,
    grantedScopes: overrides.grantedScopes ?? ['progress_tracking', 'personalization', 'data_export'],
    collectedAt: fixedNow(),
  });

  return {
    account,
    link,
    consentRecord,
    dataInventory: overrides.dataInventory ?? dataInventory,
    retentionPolicy: overrides.retentionPolicy ?? retentionPolicy,
    traceId: overrides.traceId ?? 'trace_http_test_001',
    auditEventId: overrides.auditEventId,
  };
}

function createApiHarness(context = createGuardianContext()) {
  const auditEventStore = createInMemoryAuditEventStore();
  const accessService = createAccessControlledSessionService({
    sessionService: createSessionPersistenceService({ now: fixedNow }),
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

function jsonRequest(path, { method = 'GET', body, headers = {} } = {}) {
  return new Request(`http://local.test${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function parseJson(response) {
  return JSON.parse(await response.text());
}

test('session HTTP API saves, reads, appends, and deletes through access service', async () => {
  const { api, accessService } = createApiHarness();
  let session = createMathSession();

  const createResponse = await api.handleRequest(jsonRequest('/sessions', {
    method: 'POST',
    body: { session },
    headers: { 'x-audit-event-id': 'audit_http_create_001' },
  }));
  const createPayload = await parseJson(createResponse);

  assert.equal(createResponse.status, 201);
  assert.equal(createPayload.data.sessionId, 'ses_http_math_001');
  assert.equal(createPayload.data.metadata.recordVersion, 1);
  assert.equal(createResponse.headers.get('etag'), 'W/"ses_http_math_001:1"');

  const readResponse = await api.handleRequest(jsonRequest('/sessions/ses_http_math_001', {
    headers: { 'x-audit-event-id': 'audit_http_read_001' },
  }));
  const readPayload = await parseJson(readResponse);

  assert.equal(readResponse.status, 200);
  assert.equal(readPayload.data.sessionId, 'ses_http_math_001');

  const exportResponse = await api.handleRequest(jsonRequest('/sessions/ses_http_math_001/export', {
    headers: { 'x-audit-event-id': 'audit_http_export_001' },
  }));
  const exportPayload = await parseJson(exportResponse);

  assert.equal(exportResponse.status, 200);
  assert.equal(exportPayload.data.mode, 'session_data_export');
  assert.equal(exportPayload.data.records.sessionRecord.sessionId, 'ses_http_math_001');
  assert.ok(exportPayload.data.dataInventory.some((record) => record.contractName === 'session-record'));
  assert.equal(exportPayload.data.metadata.retentionDisposition.status, 'active');

  session = selectCounter(session, 'counter_1');
  session = placeSelectedCounter(session, 'group_1', fixedNow);

  const eventResponse = await api.handleRequest(jsonRequest('/sessions/ses_http_math_001/events', {
    method: 'POST',
    body: { event: session.events.at(-1) },
    headers: {
      'x-audit-event-id': 'audit_http_event_001',
      'if-match': 'W/"ses_http_math_001:1"',
    },
  }));
  const eventPayload = await parseJson(eventResponse);
  assert.equal(eventResponse.status, 200);
  assert.equal(eventPayload.data.metadata.recordVersion, 2);

  const snapshotResponse = await api.handleRequest(jsonRequest('/sessions/ses_http_math_001/snapshots', {
    method: 'POST',
    body: { workspaceSnapshot: session.workspaceSnapshot },
    headers: {
      'x-audit-event-id': 'audit_http_snapshot_001',
      'x-record-version': '2',
    },
  }));
  const snapshotPayload = await parseJson(snapshotResponse);
  assert.equal(snapshotResponse.status, 200);
  assert.equal(snapshotPayload.data.metadata.recordVersion, 3);

  const deleteResponse = await api.handleRequest(jsonRequest('/sessions/ses_http_math_001', {
    method: 'DELETE',
    headers: {
      'x-audit-event-id': 'audit_http_delete_001',
      'if-match': 'W/"ses_http_math_001:3"',
    },
  }));
  const deletePayload = await parseJson(deleteResponse);

  assert.equal(deleteResponse.status, 200);
  assert.equal(deletePayload.data.deleted, true);
  assert.equal(deletePayload.data.sessionId, 'ses_http_math_001');
  assert.equal(deletePayload.data.tombstone.sessionId, 'ses_http_math_001');
  assert.equal(deletePayload.data.tombstone.retentionDisposition.status, 'active');
  assert.equal(await accessService.loadSessionRecord('ses_http_math_001', createGuardianContext()), null);

  const auditEvents = await accessService.listAuditEvents({ decision: 'allowed' });
  assert.deepEqual(auditEvents.map((event) => event.action), [
    'session.create',
    'session.read',
    'data.export',
    'event.append',
    'snapshot.append',
    'session.delete',
  ]);
});


test('session HTTP API lists active sessions and tombstones through access service', async () => {
  const { api } = createApiHarness();
  await api.handleRequest(jsonRequest('/sessions', {
    method: 'POST',
    body: { session: createMathSession('ses_http_list_active_001') },
    headers: { 'x-audit-event-id': 'audit_http_list_create_active_001' },
  }));
  const createDeletedResponse = await api.handleRequest(jsonRequest('/sessions', {
    method: 'POST',
    body: { session: createMathSession('ses_http_list_deleted_001') },
    headers: { 'x-audit-event-id': 'audit_http_list_create_deleted_001' },
  }));
  const createDeletedPayload = await parseJson(createDeletedResponse);

  await api.handleRequest(jsonRequest('/sessions/ses_http_list_deleted_001', {
    method: 'DELETE',
    headers: {
      'x-audit-event-id': 'audit_http_list_delete_001',
      'if-match': createDeletedResponse.headers.get('etag') ?? createDeletedPayload.data.metadata.etag,
    },
  }));

  const listResponse = await api.handleRequest(jsonRequest('/sessions', {
    headers: { 'x-audit-event-id': 'audit_http_list_active_001' },
  }));
  const listPayload = await parseJson(listResponse);

  assert.equal(listResponse.status, 200);
  assert.deepEqual(listPayload.data.map((record) => record.sessionId), ['ses_http_list_active_001']);

  const tombstoneResponse = await api.handleRequest(jsonRequest('/sessions/ses_http_list_deleted_001/tombstone', {
    headers: { 'x-audit-event-id': 'audit_http_load_tombstone_001' },
  }));
  const tombstonePayload = await parseJson(tombstoneResponse);

  assert.equal(tombstoneResponse.status, 200);
  assert.equal(tombstonePayload.data.sessionId, 'ses_http_list_deleted_001');

  const tombstonesResponse = await api.handleRequest(jsonRequest('/sessions?include=tombstones', {
    headers: { 'x-audit-event-id': 'audit_http_list_tombstones_001' },
  }));
  const tombstonesPayload = await parseJson(tombstonesResponse);

  assert.equal(tombstonesResponse.status, 200);
  assert.deepEqual(tombstonesPayload.data.map((tombstone) => tombstone.sessionId), ['ses_http_list_deleted_001']);
});

test('session HTTP API maps access denials to forbidden responses and records audits', async () => {
  const { api, accessService } = createApiHarness(createGuardianContext({ permissions: ['view_progress'] }));
  const response = await api.handleRequest(jsonRequest('/sessions', {
    method: 'POST',
    body: { session: createMathSession('ses_http_denied_001') },
    headers: { 'x-audit-event-id': 'audit_http_denied_001' },
  }));
  const payload = await parseJson(response);

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, 'forbidden');
  assert.match(payload.error.message, /not authorized to manage_sessions/);

  const deniedEvents = await accessService.listAuditEvents({ decision: 'denied' });
  assert.equal(deniedEvents.length, 1);
  assert.equal(deniedEvents[0].action, 'session.create');
});




test('session HTTP API denies exports when data_export consent is missing', async () => {
  const context = createGuardianContext({ grantedScopes: ['progress_tracking'] });
  const { api, accessService } = createApiHarness(context);
  await api.handleRequest(jsonRequest('/sessions', {
    method: 'POST',
    body: { session: createMathSession('ses_http_export_denied_001') },
    headers: { 'x-audit-event-id': 'audit_http_export_denied_create_001' },
  }));

  const response = await api.handleRequest(jsonRequest('/sessions/ses_http_export_denied_001/export', {
    headers: { 'x-audit-event-id': 'audit_http_export_denied_001' },
  }));
  const payload = await parseJson(response);

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, 'forbidden');
  assert.match(payload.error.message, /active consent is required for data_export/);

  const deniedEvents = await accessService.listAuditEvents({ decision: 'denied' });
  assert.equal(deniedEvents.length, 1);
  assert.equal(deniedEvents[0].action, 'data.export');
});


test('session HTTP API maps expired retention exports to forbidden responses', async () => {
  const { api, accessService } = createApiHarness(createGuardianContext({
    retentionPolicy: {
      ...retentionPolicy,
      id: 'retention.us.session.expired-test',
      retentionDays: 0,
    },
  }));
  await api.handleRequest(jsonRequest('/sessions', {
    method: 'POST',
    body: { session: createMathSession('ses_http_retention_expired_001') },
    headers: { 'x-audit-event-id': 'audit_http_retention_create_001' },
  }));

  const response = await api.handleRequest(jsonRequest('/sessions/ses_http_retention_expired_001/export', {
    headers: { 'x-audit-event-id': 'audit_http_retention_export_001' },
  }));
  const payload = await parseJson(response);

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, 'forbidden');
  assert.match(payload.error.message, /retention expired/);
  const auditEvents = await accessService.listAuditEvents();
  assert.deepEqual(auditEvents.map((event) => event.action), ['session.create', 'data.export']);
  assert.deepEqual(auditEvents.map((event) => event.decision), ['allowed', 'denied']);
});

test('session HTTP API maps stale record versions to conflict responses', async () => {
  const { api } = createApiHarness();
  await api.handleRequest(jsonRequest('/sessions', {
    method: 'POST',
    body: { session: createMathSession('ses_http_conflict_001') },
    headers: { 'x-audit-event-id': 'audit_http_conflict_create_001' },
  }));
  const session = placeSelectedCounter(selectCounter(createMathSession('ses_http_conflict_001'), 'counter_1'), 'group_1', fixedNow);

  const response = await api.handleRequest(jsonRequest('/sessions/ses_http_conflict_001/events', {
    method: 'POST',
    body: { event: session.events.at(-1) },
    headers: {
      'x-audit-event-id': 'audit_http_conflict_event_001',
      'if-match': '0',
    },
  }));
  const payload = await parseJson(response);

  assert.equal(response.status, 409);
  assert.equal(payload.error.code, 'conflict');
  assert.match(payload.error.message, /version conflict: expected 0, current 1/);
});

test('session HTTP API Node handler bridges real HTTP requests to the access service', async (t) => {
  const { api, accessService } = createApiHarness();
  const server = createServer(createNodeSessionHttpHandler({ api }));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const createResponse = await fetch(`${baseUrl}/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-audit-event-id': 'audit_http_node_create_001',
    },
    body: JSON.stringify({ session: createMathSession('ses_http_node_001') }),
  });
  const createPayload = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(createPayload.data.sessionId, 'ses_http_node_001');
  assert.equal(createResponse.headers.get('cache-control'), 'no-store');

  const readResponse = await fetch(`${baseUrl}/sessions/ses_http_node_001`, {
    headers: { 'x-audit-event-id': 'audit_http_node_read_001' },
  });
  const readPayload = await readResponse.json();

  assert.equal(readResponse.status, 200);
  assert.equal(readPayload.data.sessionId, 'ses_http_node_001');

  const auditEvents = await accessService.listAuditEvents({ decision: 'allowed' });
  assert.deepEqual(auditEvents.map((event) => event.action), ['session.create', 'session.read']);
});


test('session HTTP API requires a record precondition before deleting sessions', async () => {
  const { api, accessService } = createApiHarness();
  await api.handleRequest(jsonRequest('/sessions', {
    method: 'POST',
    body: { session: createMathSession('ses_http_delete_precondition_001') },
    headers: { 'x-audit-event-id': 'audit_http_delete_precondition_create_001' },
  }));

  const response = await api.handleRequest(jsonRequest('/sessions/ses_http_delete_precondition_001', {
    method: 'DELETE',
    headers: { 'x-audit-event-id': 'audit_http_delete_precondition_missing_001' },
  }));
  const payload = await parseJson(response);

  assert.equal(response.status, 428);
  assert.equal(payload.error.code, 'precondition_required');
  assert.match(payload.error.message, /deleteSession requires If-Match or X-Record-Version/);
  assert.notEqual(await accessService.loadSessionRecord('ses_http_delete_precondition_001', createGuardianContext()), null);
});

test('session HTTP API maps revoked consent, missing records, invalid JSON, and missing auth', async () => {
  const revokedContext = createGuardianContext({ consentId: 'consent_http_revoked_001' });
  const revokedConsent = revokeConsent(revokedContext.consentRecord, {
    revokedAt: '2026-05-29T00:30:00.000Z',
    reason: 'guardian_request',
  });
  const { api } = createApiHarness({ ...revokedContext, consentRecord: revokedConsent });

  const consentResponse = await api.handleRequest(jsonRequest('/sessions', {
    method: 'POST',
    body: { session: createMathSession('ses_http_revoked_001') },
    headers: { 'x-audit-event-id': 'audit_http_revoked_001' },
  }));
  assert.equal(consentResponse.status, 403);

  const missingResponse = await api.handleRequest(jsonRequest('/sessions/not_here', {
    headers: { 'x-audit-event-id': 'audit_http_missing_001' },
  }));
  const missingPayload = await parseJson(missingResponse);
  assert.equal(missingResponse.status, 404);
  assert.equal(missingPayload.error.code, 'not_found');

  const invalidResponse = await api.handleRequest(new Request('http://local.test/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{bad json',
  }));
  assert.equal(invalidResponse.status, 400);

  const unauthenticatedApi = createSessionHttpApi();
  const unauthenticatedResponse = await unauthenticatedApi.handleRequest(jsonRequest('/sessions', {
    method: 'POST',
    body: { session: createMathSession('ses_http_unauth_001') },
  }));
  const unauthenticatedPayload = await parseJson(unauthenticatedResponse);
  assert.equal(unauthenticatedResponse.status, 401);
  assert.equal(unauthenticatedPayload.error.code, 'unauthorized');
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
