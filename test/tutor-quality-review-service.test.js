import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFileTutorQualityReviewStore } from '../src/app/tutor-quality-review-store.js';
import { createAuthorizedTutorQualityReviewService } from '../src/app/tutor-quality-review-service.js';

const scorecard = JSON.parse(await readFile('examples/ai/math-hint.tutor-quality-scorecard.json', 'utf8'));
const grant = JSON.parse(await readFile('examples/ai/operator.tutor-reviewer-authority.json', 'utf8'));
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
