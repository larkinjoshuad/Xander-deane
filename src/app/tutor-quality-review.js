import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { CONTRACT_VERSION } from '../core/domain.js';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const scorecardValidator = ajv.compile(readSchema('tutor-quality-scorecard'));
const reviewValidator = ajv.compile(readSchema('tutor-quality-review'));
const decisions = ['approved', 'rejected', 'needs_revision'];

export function createTutorQualityReview({ scorecard, createdAt = new Date().toISOString() } = {}) {
  assertScorecard(scorecard);
  const review = {
    contractVersion: CONTRACT_VERSION,
    id: `review_${randomUUID()}`,
    scorecardId: scorecard.id,
    scorecardDigest: digest(scorecard),
    tutorContextId: scorecard.tutorContextId,
    tutorResponseId: scorecard.tutorResponseId,
    createdAt,
    status: 'pending_review',
    previousReviewId: null,
    reviewerId: null,
    reviewedAt: null,
    rationale: null,
    requiredActions: [],
    syntheticOnly: true,
  };
  assertReview(review, scorecard);
  return freezeJson(review);
}

export function adjudicateTutorQualityReview({
  review, scorecard, status, reviewerId, rationale, requiredActions = [],
  reviewedAt = new Date().toISOString(),
} = {}) {
  assertReview(review, scorecard);
  if (review.status !== 'pending_review') {
    throw new RangeError('only pending reviews can be adjudicated; create a new review for revised evidence');
  }
  if (!decisions.includes(status)) throw new RangeError('a review decision is required');
  const decision = {
    ...review,
    id: `review_${randomUUID()}`,
    previousReviewId: review.id,
    status,
    reviewerId,
    reviewedAt,
    rationale,
    requiredActions,
  };
  assertReview(decision, scorecard);
  return freezeJson(decision);
}

// Structural evidence check only; callers must authenticate reviewers separately.
export function validateTutorQualityReview({ review, scorecard } = {}) {
  assertReview(review, scorecard);
  return true;
}

export function isTutorQualityReviewApproved({ review, scorecard } = {}) {
  try {
    assertReview(review, scorecard);
    return review.status === 'approved';
  } catch {
    return false;
  }
}

function assertReview(review, scorecard) {
  assertValid(reviewValidator, review, 'review');
  assertScorecard(scorecard);
  if (review.scorecardId !== scorecard.id || review.tutorContextId !== scorecard.tutorContextId
    || review.tutorResponseId !== scorecard.tutorResponseId || review.scorecardDigest !== digest(scorecard)) {
    throw new RangeError('review evidence does not match the supplied scorecard');
  }
  const createdAt = Date.parse(review.createdAt);
  const evaluatedAt = Date.parse(scorecard.evaluatedAt);
  const reviewedAt = review.reviewedAt === null ? null : Date.parse(review.reviewedAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(evaluatedAt)
    || (reviewedAt !== null && !Number.isFinite(reviewedAt))
    || createdAt < evaluatedAt || (reviewedAt !== null && reviewedAt < createdAt)) {
    throw new RangeError('review timestamps must follow evaluation and creation');
  }
  if (review.previousReviewId === review.id) throw new RangeError('a review cannot supersede itself');
  if (review.status === 'approved' && !scorecard.passed) {
    throw new RangeError('approval requires a passing issue-free scorecard');
  }
}

function assertScorecard(scorecard) {
  assertValid(scorecardValidator, scorecard, 'scorecard');
  const scores = Object.values(scorecard.rubricScores);
  const total = scores.reduce((sum, entry) => sum + entry.score, 0);
  const maximum = scores.reduce((sum, entry) => sum + entry.maxScore, 0);
  if (scores.some((entry) => entry.maxScore !== 2 || entry.score > entry.maxScore)
    || scorecard.totalScore !== total || scorecard.maxScore !== maximum
    || scorecard.passingScore > maximum
    || scorecard.passed !== (total >= scorecard.passingScore && scorecard.issues.length === 0)
    || (scorecard.passed && scores.some((entry) => entry.score !== entry.maxScore))) {
    throw new RangeError('scorecard rubric totals or pass evidence are inconsistent');
  }
}

function assertValid(validate, value, name) {
  if (!validate(value)) throw new TypeError(`${name}: ${ajv.errorsText(validate.errors)}`);
}

function readSchema(name) {
  return JSON.parse(readFileSync(new URL(`../../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function freezeJson(value) {
  const copy = JSON.parse(JSON.stringify(value));
  function freeze(entry) {
    if (entry && typeof entry === 'object') {
      Object.values(entry).forEach(freeze);
      Object.freeze(entry);
    }
  }
  freeze(copy);
  return copy;
}
