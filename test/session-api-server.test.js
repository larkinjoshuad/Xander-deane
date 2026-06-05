import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { createInitialLearningSession } from '../src/app/learning-session.js';
import { createSessionApiServer } from '../src/app/session-api-server.js';

const execFileAsync = promisify(execFile);
const hasSqlite = await execFileAsync('sqlite3', ['-version']).then(() => true, () => false);
const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const account = readJson('examples/identity/guardian.account.json');
const link = readJson('examples/identity/guardian-link.learner-account-link.json');
const consentRecord = readJson('examples/safety/guardian-consent.consent-record.json');
const dataInventory = readJson('examples/governance/base.data-inventory.json');
const bearerToken = 'test-session-api-token';
const now = () => '2026-05-30T00:00:00.000Z';

test('session API server persists authorized sessions through SQLite and records audit events', { skip: !hasSqlite }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-session-api-server-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'session-api.sqlite');
  const { server, accessService } = await createSessionApiServer({
    databasePath,
    account,
    link,
    consentRecord,
    dataInventory,
    bearerToken,
    now,
  });
  t.after(() => closeServer(server));
  await listen(server);
  const baseUrl = localServerUrl(server);
  const session = createInitialLearningSession({
    sessionId: 'ses_session_api_server_001',
    learnerId: link.learnerId,
    objective,
    problem,
    now,
  });

  const healthResponse = await fetch(`${baseUrl}/healthz`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: 'ok', storage: 'sqlite' });

  const createResponse = await fetch(`${baseUrl}/sessions`, {
    method: 'POST',
    headers: authHeaders({ auditEventId: 'audit_session_api_server_create_001' }),
    body: JSON.stringify({ session }),
  });
  const createPayload = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(createPayload.data.sessionId, session.sessionId);
  assert.equal(createPayload.data.metadata.recordVersion, 1);

  const readResponse = await fetch(`${baseUrl}/sessions/${session.sessionId}`, {
    headers: authHeaders({ auditEventId: 'audit_session_api_server_read_001' }),
  });
  const readPayload = await readResponse.json();

  assert.equal(readResponse.status, 200);
  assert.equal(readPayload.data.sessionId, session.sessionId);

  const exportResponse = await fetch(`${baseUrl}/sessions/${session.sessionId}/export`, {
    headers: authHeaders({ auditEventId: 'audit_session_api_server_export_001' }),
  });
  const exportPayload = await exportResponse.json();

  assert.equal(exportResponse.status, 200);
  assert.equal(exportPayload.data.mode, 'session_data_export');
  assert.ok(exportPayload.data.dataInventory.some((record) => record.contractName === 'session-record'));

  const auditEvents = await accessService.listAuditEvents({ decision: 'allowed' });
  assert.deepEqual(new Set(auditEvents.map((event) => event.action)), new Set(['session.create', 'session.read', 'data.export']));
});

test('session API server rejects missing tokens and mismatched learner headers', { skip: !hasSqlite }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'xander-session-api-auth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { server } = await createSessionApiServer({
    databasePath: join(directory, 'session-api.sqlite'),
    account,
    link,
    consentRecord,
    dataInventory,
    bearerToken,
    now,
  });
  t.after(() => closeServer(server));
  await listen(server);
  const baseUrl = localServerUrl(server);
  const session = createInitialLearningSession({
    sessionId: 'ses_session_api_auth_001',
    learnerId: link.learnerId,
    objective,
    problem,
    now,
  });

  const missingTokenResponse = await fetch(`${baseUrl}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session }),
  });
  const missingTokenPayload = await missingTokenResponse.json();
  assert.equal(missingTokenResponse.status, 401);
  assert.equal(missingTokenPayload.error.code, 'unauthorized');

  const mismatchedLearnerResponse = await fetch(`${baseUrl}/sessions`, {
    method: 'POST',
    headers: authHeaders({ learnerId: 'learner_other_001' }),
    body: JSON.stringify({ session }),
  });
  const mismatchedLearnerPayload = await mismatchedLearnerResponse.json();
  assert.equal(mismatchedLearnerResponse.status, 401);
  assert.equal(mismatchedLearnerPayload.error.code, 'unauthorized');
});

function authHeaders({ learnerId = link.learnerId, auditEventId = 'audit_session_api_server_test_001' } = {}) {
  return {
    authorization: `Bearer ${bearerToken}`,
    'content-type': 'application/json',
    'x-account-id': account.id,
    'x-learner-id': learnerId,
    'x-audit-event-id': auditEventId,
  };
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

function localServerUrl(server) {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
