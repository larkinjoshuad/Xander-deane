import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFileTutorQualityReviewStore } from '../src/app/tutor-quality-review-store.js';

const scorecard = JSON.parse(await readFile('examples/ai/math-hint.tutor-quality-scorecard.json', 'utf8'));
const createdAt = '2026-06-04T01:00:00.000Z';
const decision = {
  scorecard, status: 'approved', reviewerId: 'synthetic_reviewer_001',
  rationale: 'Synthetic evidence reviewed.', reviewedAt: '2026-06-04T02:00:00.000Z',
};
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'tutor-review-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createFileTutorQualityReviewStore({ directory });
  const pending = await store.create({ scorecard, createdAt });
  return { directory, store, pending, file: join(directory, `${pending.id}.json`) };
}

test('review history survives restart and returned data cannot mutate stored evidence', async (t) => {
  const { directory, store, pending } = await setup(t);
  const approved = await store.adjudicate({ ...decision, reviewId: pending.id });
  const reopened = createFileTutorQualityReviewStore({ directory });
  const history = await reopened.history(pending.id);
  assert.deepEqual(history, [pending, approved]);
  history[0].status = 'rejected';
  assert.deepEqual(await reopened.history(pending.id), [pending, approved]);
  await assert.rejects(reopened.adjudicate({ ...decision, reviewId: pending.id }), { code: 'REVIEW_CONFLICT' });
});

test('independent store instances allow exactly one competing decision', async (t) => {
  const { directory, store, pending } = await setup(t);
  const second = createFileTutorQualityReviewStore({ directory });
  const results = await Promise.allSettled([
    store.adjudicate({ ...decision, reviewId: pending.id }),
    second.adjudicate({ ...decision, reviewId: pending.id, status: 'rejected' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'REVIEW_CONFLICT');
  assert.equal((await store.history(pending.id)).length, 2);
});

test('independent processes cannot finalize the same pending review twice', { timeout: 10000 }, async (t) => {
  const { directory, store, pending } = await setup(t);
  const moduleUrl = new URL('../src/app/tutor-quality-review-store.js', import.meta.url).href;
  const launch = async (status) => {
    const code = `
      import {once} from 'node:events';
      import {createFileTutorQualityReviewStore} from ${JSON.stringify(moduleUrl)};
      const store = createFileTutorQualityReviewStore(${JSON.stringify({ directory })});
      const start = once(process.stdin, 'data');
      console.log('ready');
      await start;
      try {
        await store.adjudicate(${JSON.stringify({ ...decision, status, reviewId: pending.id })});
        console.log('committed');
      } catch (error) { console.log(error.code || error.message); }
      process.stdin.destroy();
    `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['pipe', 'pipe', 'pipe'] });
    t.after(() => child.kill());
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    const done = once(child, 'close');
    await once(child.stdout, 'data');
    return { child, done, output: () => output };
  };
  const workers = await Promise.all([launch('approved'), launch('rejected')]);
  workers.forEach(({ child }) => child.stdin.end('go'));
  const exits = await Promise.all(workers.map(({ done }) => done));
  assert.ok(exits.every(([code]) => code === 0));
  assert.equal(workers.filter((w) => w.output().includes('committed')).length, 1);
  assert.equal(workers.filter((w) => w.output().includes('REVIEW_CONFLICT')).length, 1);
  assert.equal((await store.history(pending.id)).length, 2);
});

test('invalid or mismatched evidence leaves pending history unchanged and releases lock', async (t) => {
  const { store, pending } = await setup(t);
  for (const invalid of [
    { rationale: '' }, { status: 'needs_revision' },
    { scorecard: { ...scorecard, id: 'changed' } },
  ]) {
    await assert.rejects(store.adjudicate({ ...decision, ...invalid, reviewId: pending.id }));
    assert.deepEqual(await store.history(pending.id), [pending]);
  }
  assert.equal((await store.adjudicate({ ...decision, reviewId: pending.id })).status, 'approved');
  await assert.rejects(store.history('../escape'));
  await assert.rejects(store.adjudicate({ ...decision, reviewId: 'review_missing' }), { code: 'ENOENT' });
});

test('stale locks fail closed while incomplete temporary files never replace readable history', async (t) => {
  const { store, pending, file } = await setup(t);
  await writeFile(`${file}.tmp`, '{unfinished');
  await mkdir(`${file}.lock`);
  await assert.rejects(store.adjudicate({ ...decision, reviewId: pending.id }), { code: 'REVIEW_CONFLICT' });
  assert.deepEqual(await store.history(pending.id), [pending]);
  await rm(`${file}.lock`, { recursive: true });
  await store.adjudicate({ ...decision, reviewId: pending.id });
  assert.equal((await store.history(pending.id)).length, 2);
});

test('corrupt histories fail closed without being overwritten', async (t) => {
  const { store, pending, file } = await setup(t);
  const approved = await store.adjudicate({ ...decision, reviewId: pending.id });
  for (const contents of [
    '{unfinished',
    JSON.stringify({ scorecard, reviews: [approved] }),
    JSON.stringify({ scorecard, reviews: [pending, { ...approved, previousReviewId: 'review_other' }] }),
    JSON.stringify({ scorecard: { ...scorecard, id: 'changed' }, reviews: [pending] }),
  ]) {
    await writeFile(file, contents);
    await assert.rejects(store.history(pending.id));
    await assert.rejects(store.adjudicate({ ...decision, reviewId: pending.id }));
    assert.equal(await readFile(file, 'utf8'), contents);
  }
});

test('failed writes preserve history and inputs are snapshotted before asynchronous storage', async (t) => {
  const { directory, store, pending, file } = await setup(t);
  await mkdir(`${file}.tmp`);
  await assert.rejects(store.adjudicate({ ...decision, reviewId: pending.id }));
  assert.deepEqual(await store.history(pending.id), [pending]);
  await rm(`${file}.tmp`, { recursive: true });
  const options = { ...decision, requiredActions: [] };
  const write = store.adjudicate({ ...options, reviewId: pending.id });
  options.requiredActions.push('Late caller mutation');
  assert.equal((await write).status, 'approved');
  const independent = await store.create({ scorecard, createdAt });
  assert.deepEqual(await createFileTutorQualityReviewStore({ directory }).history(independent.id), [independent]);
});
