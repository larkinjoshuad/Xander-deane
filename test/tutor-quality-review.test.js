import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createTutorQualityReview, adjudicateTutorQualityReview, isTutorQualityReviewApproved,
} from '../src/app/tutor-quality-review.js';
import { validateJsonSchema } from '../scripts/validate-fixtures.js';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const scorecard = read('examples/ai/math-hint.tutor-quality-scorecard.json');
const schema = read('schemas/tutor-quality-review.schema.json');
const createdAt = '2026-06-04T01:00:00.000Z';
const reviewedAt = '2026-06-04T02:00:00.000Z';
const pending = () => createTutorQualityReview({ scorecard, createdAt });
const decide = (overrides = {}) => adjudicateTutorQualityReview({
  review: pending(), scorecard, status: 'approved',
  reviewerId: 'synthetic_reviewer_001', rationale: 'Synthetic hint checked against the rubric.',
  reviewedAt, ...overrides,
});

test('creates immutable pending evidence and schema-compatible decisions for all statuses', () => {
  const review = pending();
  assert.equal(review.status, 'pending_review');
  assert.equal(review.reviewerId, null);
  assert.equal(isTutorQualityReviewApproved({ review, scorecard }), false);
  assert.deepEqual(validateJsonSchema(review, schema), []);
  for (const status of ['approved', 'rejected', 'needs_revision']) {
    const requiredActions = status === 'needs_revision' ? ['Revise the synthetic hint.'] : [];
    const result = decide({ review, status, requiredActions });
    assert.deepEqual(validateJsonSchema(result, schema), []);
    assert.notEqual(result.id, review.id);
    assert.equal(result.previousReviewId, review.id);
    assert.equal(result.status, status);
    assert.equal(review.status, 'pending_review');
    assert.equal(isTutorQualityReviewApproved({ review: result, scorecard }), status === 'approved');
    assert.ok(Object.isFrozen(result.requiredActions));
    assert.equal(Object.isFrozen(requiredActions), false);
  }
});

test('requires explicit reviewer identity, rationale, valid chronology, and revision actions', () => {
  for (const overrides of [
    { reviewerId: undefined }, { reviewerId: '' }, { reviewerId: 'queue' },
    { rationale: undefined }, { rationale: '   ' },
    { reviewedAt: '2026-02-30T00:00:00Z' }, { reviewedAt: '2026-06-03T00:00:00Z' },
    { reviewedAt: '2026-06-30T23:59:60Z' },
    { status: 'pending_review' }, { status: 'needs_revision' },
    { requiredActions: ['Outstanding fix'] },
  ]) assert.throws(() => decide(overrides));
  assert.throws(() => createTutorQualityReview({ scorecard, createdAt: '2026-06-03T00:00:00Z' }));
  assert.throws(() => decide({ review: decide() }), /only pending/);
});

test('approval binds the complete scorecard and tolerates JSON key order changes', () => {
  const review = decide();
  const reordered = Object.fromEntries(Object.entries(scorecard).reverse());
  assert.equal(isTutorQualityReviewApproved({ review, scorecard: reordered }), true);
  for (const changed of [
    { ...scorecard, id: 'different' },
    { ...scorecard, tutorResponseId: 'different' },
    { ...scorecard, metadata: { ...scorecard.metadata, fixturePurpose: 'changed' } },
    { ...scorecard, rubricScores: { ...scorecard.rubricScores,
      safety: { ...scorecard.rubricScores.safety, notes: ['Changed evidence'] } } },
  ]) {
    assert.equal(isTutorQualityReviewApproved({ review, scorecard: changed }), false);
    assert.throws(() => decide({ scorecard: changed }), /evidence/);
  }
});

test('rejects malformed, contradictory, non-synthetic, and failed approval evidence', () => {
  assert.equal(isTutorQualityReviewApproved(), false);
  for (const review of [
    null, { status: 'approved', syntheticOnly: true },
    { ...decide(), reviewerId: null }, { ...decide(), rationale: null },
    { ...decide(), syntheticOnly: false }, { ...decide(), requiredActions: ['Unresolved'] },
  ]) assert.equal(isTutorQualityReviewApproved({ review, scorecard }), false);
  for (const invalid of [
    { ...scorecard, metadata: { syntheticOnly: false } },
    { ...scorecard, totalScore: 0 }, { ...scorecard, passed: false },
    { ...scorecard, issues: ['unresolved'] },
  ]) assert.throws(() => createTutorQualityReview({ scorecard: invalid, createdAt }));
  const failed = { ...scorecard, passed: false, issues: ['Human check required'] };
  const review = createTutorQualityReview({ scorecard: failed, createdAt });
  assert.throws(() => decide({ review, scorecard: failed }), /passing/);
  assert.equal(decide({ review, scorecard: failed, status: 'rejected' }).status, 'rejected');
});

test('pending fixture round-trips through schema validation and adjudication', () => {
  const review = read('examples/ai/math-hint.tutor-quality-review.json');
  assert.deepEqual(validateJsonSchema(review, schema), []);
  assert.equal(isTutorQualityReviewApproved({ review, scorecard }), false);
  const approved = JSON.parse(JSON.stringify(decide({ review })));
  assert.equal(isTutorQualityReviewApproved({ review: approved, scorecard }), true);
  assert.equal(approved.previousReviewId, review.id);
});

test('schema rejects incomplete approvals independently of the runtime helper', () => {
  const approved = decide();
  for (const review of [
    { ...approved, reviewerId: null }, { ...approved, rationale: ' ' },
    { ...approved, previousReviewId: null }, { ...approved, reviewedAt: null },
    { ...approved, status: 'needs_revision', requiredActions: [] },
    { ...pending(), reviewerId: 'synthetic_reviewer_001' },
  ]) assert.ok(validateJsonSchema(review, schema).length > 0);
});
