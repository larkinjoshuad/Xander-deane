import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(
  new URL('../../schemas/tutor-reviewer-authority.schema.json', import.meta.url), 'utf8',
)));

export function createAuthorizedTutorQualityReviewService({ store, resolveAuthority, now = () => new Date().toISOString() } = {}) {
  if (!store || ['create', 'adjudicate', 'history'].some((key) => typeof store[key] !== 'function')
    || typeof resolveAuthority !== 'function' || typeof now !== 'function') {
    throw new TypeError('store, trusted resolveAuthority, and clock are required');
  }

  async function authorize(session, permission, expectedReviewer) {
    if (typeof session !== 'string' || !session.trim()) throw denied();
    let authority;
    try { authority = await resolveAuthority(session); } catch { throw denied(); }
    const time = Date.parse(now());
    if (!validate(authority) || !Number.isFinite(time)) throw denied();
    const start = Date.parse(authority.validFrom);
    const end = Date.parse(authority.expiresAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > time || end <= time
      || authority.status !== 'active' || !authority.permissions.includes(permission)
      || (expectedReviewer && authority.reviewerId !== expectedReviewer)) throw denied();
    return authority.reviewerId;
  }

  return Object.freeze({
    async create(options, session) {
      const snapshot = JSON.parse(JSON.stringify(options));
      const reviewer = await authorize(session, 'create_review');
      return store.create({ scorecard: snapshot.scorecard, createdAt: now() },
        () => authorize(session, 'create_review', reviewer));
    },
    async adjudicate(options, session) {
      const snapshot = JSON.parse(JSON.stringify(options));
      if (Object.hasOwn(snapshot, 'reviewerId') || Object.hasOwn(snapshot, 'reviewedAt')) {
        throw new TypeError('reviewer identity and decision time are server-controlled');
      }
      const reviewerId = await authorize(session, 'adjudicate_review');
      return store.adjudicate({
        reviewId: snapshot.reviewId, scorecard: snapshot.scorecard, status: snapshot.status,
        rationale: snapshot.rationale, requiredActions: snapshot.requiredActions,
        reviewerId, reviewedAt: now(),
      }, () => authorize(session, 'adjudicate_review', reviewerId));
    },
    async history(reviewId, session) {
      const reviewer = await authorize(session, 'read_review');
      const history = await store.history(reviewId);
      await authorize(session, 'read_review', reviewer);
      return history;
    },
  });
}

function denied() {
  const error = new Error('review access denied');
  error.code = 'REVIEW_FORBIDDEN';
  return error;
}
