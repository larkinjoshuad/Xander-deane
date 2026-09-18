import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFileTutorQualityReviewStore } from '../src/app/tutor-quality-review-store.js';
import { createAuthorizedTutorQualityReviewService as createService } from '../src/app/tutor-quality-review-service.js';
import { createInMemoryAuditEventStore, createFileAuditEventStore } from '../src/app/session-access-service.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const createAuthorizedTutorQualityReviewService = (options) => createService({
  auditEventStore: createInMemoryAuditEventStore(), ...options,
});

const scorecard = JSON.parse(await readFile('examples/ai/math-hint.tutor-quality-scorecard.json', 'utf8'));
const grant = JSON.parse(await readFile('examples/ai/operator.tutor-reviewer-authority.json', 'utf8'));
const auditSchema = JSON.parse(await readFile('schemas/audit-event.schema.json', 'utf8'));
const now = () => '2026-06-04T02:00:00.000Z';
const session = 'synthetic-session-test-only';
const choice = { scorecard, status: 'approved', rationale: 'Synthetic evidence inspected.' };
async function setup(t, resolveAuthority = async (token) => token === session ? grant : null) {
  const directory = await mkdtemp(join(tmpdir(), 'review-authority-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createFileTutorQualityReviewStore({ directory });
  const service = createAuthorizedTutorQualityReviewService({ store, resolveAuthority, now });
  const pending = await store.create({ scorecard, createdAt: now() });
  return { directory, store, service, pending };
}

test('authorized service stamps trusted identity and time without persisting session credentials', async (t) => {
  const { directory, service } = await setup(t);
  const pending = await service.create({ scorecard }, session);
  const result = await service.adjudicate({ ...choice, reviewId: pending.id }, session);
  assert.equal(result.reviewerId, grant.reviewerId);
  assert.equal(result.reviewedAt, now());
  assert.deepEqual(await service.history(pending.id, session), [pending, result]);
  for (const file of await readdir(directory)) {
    assert.equal((await readFile(join(directory, file), 'utf8')).includes(session), false);
  }
});

test('missing, unknown, or caller-forged identity is denied before storage access', async () => {
  let calls = 0;
  const store = Object.fromEntries(['create', 'adjudicate', 'history'].map((key) => [key, async () => { calls++; }]));
  const service = createAuthorizedTutorQualityReviewService({ store, resolveAuthority: async () => null, now });
  for (const token of [undefined, '', 'unknown', grant]) {
    await assert.rejects(service.create({ scorecard }, token), { code: 'REVIEW_FORBIDDEN' });
    await assert.rejects(service.adjudicate({ ...choice, reviewId: 'review_missing' }, token), { code: 'REVIEW_FORBIDDEN' });
    await assert.rejects(service.history('review_missing', token), { code: 'REVIEW_FORBIDDEN' });
  }
  assert.equal(calls, 0);
});

test('inactive, expired, future, malformed and non-synthetic authority fails closed', async (t) => {
  for (const invalid of [
    { ...grant, status: 'revoked' }, { ...grant, status: 'suspended' },
    { ...grant, expiresAt: now() }, { ...grant, validFrom: '2026-06-05T00:00:00Z' },
    { ...grant, expiresAt: 'invalid' }, { ...grant, syntheticOnly: false },
    { ...grant, reviewerId: 'real_person' }, { ...grant, permissions: [] }, null,
  ]) {
    const { store, service, pending } = await setup(t, async () => invalid);
    await assert.rejects(service.adjudicate({ ...choice, reviewId: pending.id }, session), { code: 'REVIEW_FORBIDDEN' });
    assert.deepEqual(await store.history(pending.id), [pending]);
  }
});

test('permissions are independent and request identity or timestamps cannot override the server', async (t) => {
  const { store, service, pending } = await setup(t, async () => ({ ...grant, permissions: ['read_review'] }));
  assert.deepEqual(await service.history(pending.id, session), [pending]);
  await assert.rejects(service.create({ scorecard }, session), { code: 'REVIEW_FORBIDDEN' });
  await assert.rejects(service.adjudicate({ ...choice, reviewId: pending.id }, session), { code: 'REVIEW_FORBIDDEN' });
  const full = createAuthorizedTutorQualityReviewService({ store, resolveAuthority: async () => grant, now });
  for (const extra of [{ reviewerId: 'synthetic_reviewer_forged' }, { reviewedAt: now() }]) {
    await assert.rejects(full.adjudicate({ ...choice, ...extra, reviewId: pending.id }, session), /server-controlled/);
  }
  assert.deepEqual(await store.history(pending.id), [pending]);
});

test('revocation or identity changes at commit time preserve pending history and release the lock', async (t) => {
  for (const changed of [{ ...grant, status: 'revoked' }, { ...grant, reviewerId: 'synthetic_reviewer_other' }]) {
    let count = 0;
    const { store, service, pending } = await setup(t, async () => ++count === 1 ? grant : changed);
    await assert.rejects(service.adjudicate({ ...choice, reviewId: pending.id }, session), { code: 'REVIEW_FORBIDDEN' });
    assert.deepEqual(await store.history(pending.id), [pending]);
    const retry = createAuthorizedTutorQualityReviewService({ store, resolveAuthority: async () => grant, now });
    assert.equal((await retry.adjudicate({ ...choice, reviewId: pending.id }, session)).status, 'approved');
  }
});

test('resolver failures are redacted and access is rechecked before disclosing history', async (t) => {
  let count = 0;
  const { service, pending } = await setup(t, async () => {
    if (++count > 1) throw new Error('private authentication detail');
    return grant;
  });
  await assert.rejects(service.history(pending.id, session), { code: 'REVIEW_FORBIDDEN', message: 'review access denied' });
  await assert.rejects(service.create({ scorecard }, session), { code: 'REVIEW_FORBIDDEN' });
});

test('creation rechecks authority before writing and adjudication permission does not grant reads', async (t) => {
  let count = 0;
  const { directory, store, service, pending } = await setup(t, async () => (
    ++count === 1 ? grant : { ...grant, status: 'revoked' }
  ));
  const before = await readdir(directory);
  await assert.rejects(service.create({ scorecard }, session), { code: 'REVIEW_FORBIDDEN' });
  assert.deepEqual(await readdir(directory), before);
  const adjudicator = createAuthorizedTutorQualityReviewService({
    store, now, resolveAuthority: async () => ({ ...grant, permissions: ['adjudicate_review'] }),
  });
  await assert.rejects(adjudicator.history(pending.id, session), { code: 'REVIEW_FORBIDDEN' });
  assert.equal((await adjudicator.adjudicate({ ...choice, reviewId: pending.id }, session)).status, 'approved');
});

test('durable audit events distinguish allowed, completed, denied, and failed without request content', async (t) => {
  const { directory, store, pending } = await setup(t);
  const auditDirectory = join(directory, 'audit');
  const auditEventStore = createFileAuditEventStore({ directory: auditDirectory });
  const service = createService({ store, now, auditEventStore,
    resolveAuthority: async (token) => token === session ? grant : null });
  await service.adjudicate({ ...choice, reviewId: pending.id }, session);
  await service.history(pending.id, session);
  await service.create({ scorecard }, session);
  await assert.rejects(service.history('private-request-id', 'private-session'), { code: 'REVIEW_FORBIDDEN' });
  await assert.rejects(service.adjudicate({ ...choice, reviewId: pending.id }, session), { code: 'REVIEW_CONFLICT' });
  const events = await createFileAuditEventStore({ directory: auditDirectory }).listAuditEvents();
  assert.deepEqual(events.map((e) => e.metadata.phase), [
    'authorized', 'completed', 'authorized', 'completed', 'authorized', 'completed', 'denied', 'failed',
  ]);
  events.forEach((event) => assert.deepEqual(validateJsonSchema(event, auditSchema), []));
  assert.equal(events[0].traceId, events[1].traceId);
  assert.notEqual(events[0].traceId, events[2].traceId);
  assert.equal(new Set(events.map((e) => e.id)).size, events.length);
  assert.equal(events[0].metadata.reviewerId, grant.reviewerId);
  assert.equal(events[6].metadata.reviewerId, null);
  const serialized = JSON.stringify(events);
  for (const secret of [session, 'private-session', 'private-request-id', choice.rationale, scorecard.id]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('audit failure blocks writes and reads, and does not leak storage errors', async (t) => {
  const { store, pending } = await setup(t);
  const service = createService({ store, now, resolveAuthority: async () => grant,
    auditEventStore: { async saveAuditEvent() { throw new Error('private storage detail'); } } });
  for (const operation of [
    () => service.adjudicate({ ...choice, reviewId: pending.id }, session),
    () => service.history(pending.id, session),
    () => service.create({ scorecard }, session),
  ]) await assert.rejects(operation(), {
    code: 'REVIEW_AUDIT_UNAVAILABLE', message: 'review audit unavailable', operationCompleted: false,
  });
  assert.deepEqual(await store.history(pending.id), [pending]);
});

test('completion audit failure explicitly reports a completed operation instead of suggesting rollback', async (t) => {
  const { store, pending } = await setup(t);
  let writes = 0;
  const service = createService({ store, now, resolveAuthority: async () => grant,
    auditEventStore: { async saveAuditEvent() { if (++writes === 2) throw new Error('offline'); } } });
  await assert.rejects(service.adjudicate({ ...choice, reviewId: pending.id }, session), (error) => {
    assert.equal(error.code, 'REVIEW_AUDIT_UNAVAILABLE');
    assert.equal(error.operationCompleted, true);
    assert.match(error.traceId, /^review_trace_/);
    return true;
  });
  assert.equal((await store.history(pending.id))[1].status, 'approved');
  assert.equal(writes, 2);
});

test('revocation produces a denial audit and an audit sink is mandatory', async (t) => {
  const { store, pending } = await setup(t);
  const auditEventStore = createInMemoryAuditEventStore();
  let calls = 0;
  const service = createService({ store, now, auditEventStore,
    resolveAuthority: async () => ++calls === 1 ? grant : { ...grant, status: 'revoked' } });
  await assert.rejects(service.adjudicate({ ...choice, reviewId: pending.id }, session), { code: 'REVIEW_FORBIDDEN' });
  const events = await auditEventStore.listAuditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].decision, 'denied');
  assert.equal(events[0].metadata.reviewerId, grant.reviewerId);
  assert.throws(() => createService({ store, now, resolveAuthority: async () => grant }), /auditEventStore/);
});

test('restart reconciliation restores missing completion with the original ID without changing the decision', async (t) => {
  const { directory, store, pending } = await setup(t);
  const sink = createFileAuditEventStore({ directory: join(directory, 'audit') });
  let missing;
  const service = createService({ store, now, resolveAuthority: async () => grant, auditEventStore: {
    async saveAuditEvent(event) {
      if (event.metadata.phase === 'completed') { missing = event; throw new Error('offline'); }
      return sink.saveAuditEvent(event);
    },
  } });
  await assert.rejects(service.adjudicate({ ...choice, reviewId: pending.id }, session), { operationCompleted: true });
  const before = await store.history(pending.id);
  const reopened = createFileTutorQualityReviewStore({ directory });
  assert.deepEqual(await reopened.reconcileAuditEvents(sink), { delivered: 1, inspected: 1 });
  assert.deepEqual((await sink.listAuditEvents()).at(-1), missing);
  assert.deepEqual(await reopened.reconcileAuditEvents(sink), { delivered: 0, inspected: 1 });
  assert.deepEqual(await reopened.history(pending.id), before);
});

test('creation recovery discovers the pending ID after an uncertain result and skips acknowledged audit events', async (t) => {
  const { directory, store } = await setup(t);
  const sink = createInMemoryAuditEventStore();
  const service = createService({ store, now, resolveAuthority: async () => grant, auditEventStore: {
    async saveAuditEvent(event) {
      await sink.saveAuditEvent(event);
      if (event.metadata.phase === 'completed') throw new Error('acknowledgment lost');
    },
  } });
  await assert.rejects(service.create({ scorecard }, session), { operationCompleted: true });
  const completed = (await sink.listAuditEvents()).at(-1);
  assert.equal((await store.history(completed.metadata.reviewId))[0].status, 'pending_review');
  assert.deepEqual(await createFileTutorQualityReviewStore({ directory }).reconcileAuditEvents(sink), { delivered: 0, inspected: 1 });
});

test('reconciliation retries sink outages, rejects ID collisions and corrupt recovery records', async (t) => {
  const { directory, store, pending } = await setup(t);
  const sink = createInMemoryAuditEventStore();
  const service = createService({ store, now, resolveAuthority: async () => grant, auditEventStore: sink });
  await service.adjudicate({ ...choice, reviewId: pending.id }, session);
  const completion = (await sink.listAuditEvents()).at(-1);
  await assert.rejects(store.reconcileAuditEvents({ listAuditEvents: async () => [], saveAuditEvent: async () => { throw new Error('offline'); } }), /offline/);
  const collision = createInMemoryAuditEventStore([{ ...completion, reason: 'different' }]);
  await assert.rejects(store.reconcileAuditEvents(collision), /collision/);
  const fresh = createInMemoryAuditEventStore();
  assert.equal((await store.reconcileAuditEvents(fresh)).delivered, 1);
  const path = join(directory, `${pending.id}.json`);
  const packet = JSON.parse(await readFile(path, 'utf8'));
  packet.auditCompletions[0].metadata.reviewId = 'review_wrong';
  await writeFile(path, JSON.stringify(packet));
  await assert.rejects(store.reconcileAuditEvents(fresh), /committed evidence/);
  assert.equal((await fresh.listAuditEvents()).length, 1);
});

test('legacy packets generate no completion evidence and concurrent reconciliation fails closed', async (t) => {
  const { store, pending } = await setup(t);
  const sink = createInMemoryAuditEventStore();
  assert.deepEqual(await store.reconcileAuditEvents(sink), { delivered: 0, inspected: 0 });
  let release;
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  const wait = new Promise((resolve) => { release = resolve; });
  const first = store.reconcileAuditEvents({
    async listAuditEvents() { started(); await wait; return []; },
    saveAuditEvent: sink.saveAuditEvent,
  });
  await entered;
  try {
    await assert.rejects(store.reconcileAuditEvents(sink), { code: 'REVIEW_CONFLICT' });
  } finally { release(); await first; }
  assert.deepEqual(await store.history(pending.id), [pending]);
});

test('failed persistence creates no replayable completion; later commits retain both recovery records', async (t) => {
  const { directory, store, pending } = await setup(t);
  const sink = createInMemoryAuditEventStore();
  const service = createService({ store, now, resolveAuthority: async () => grant, auditEventStore: sink });
  const temporary = join(directory, `${pending.id}.json.tmp`);
  await mkdir(temporary);
  await assert.rejects(service.adjudicate({ ...choice, reviewId: pending.id }, session));
  assert.deepEqual(await store.reconcileAuditEvents(sink), { delivered: 0, inspected: 0 });
  assert.deepEqual(await store.history(pending.id), [pending]);
  await rm(temporary, { recursive: true });
  const created = await service.create({ scorecard }, session);
  await service.adjudicate({ ...choice, reviewId: created.id }, session);
  const recovered = createInMemoryAuditEventStore();
  assert.deepEqual(await store.reconcileAuditEvents(recovered), { delivered: 2, inspected: 2 });
  assert.deepEqual((await recovered.listAuditEvents()).map((event) => event.action), ['tutor_review.create', 'tutor_review.adjudicate']);
});
