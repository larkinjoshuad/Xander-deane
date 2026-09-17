import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { randomUUID } from 'node:crypto';
import { createAuditEvent } from './audit-log.js';

const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(
  new URL('../../schemas/tutor-reviewer-authority.schema.json', import.meta.url), 'utf8',
)));

export function createAuthorizedTutorQualityReviewService({ store, resolveAuthority, auditEventStore, now = () => new Date().toISOString() } = {}) {
  if (!store || ['create', 'adjudicate', 'history'].some((key) => typeof store[key] !== 'function')
    || typeof resolveAuthority !== 'function' || typeof now !== 'function'
    || typeof auditEventStore?.saveAuditEvent !== 'function') {
    throw new TypeError('store, trusted resolveAuthority, auditEventStore, and clock are required');
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

  async function audited(action, permission, operation) {
    const traceId = `review_trace_${randomUUID()}`;
    let reviewer = null;
    async function log(phase, decision, operationCompleted = false) {
      try {
        await auditEventStore.saveAuditEvent(createAuditEvent({
          id: `audit_${randomUUID()}`, occurredAt: now(), action,
          resourceType: 'tutor_review_collection', resourceId: 'synthetic_review_collection',
          permission, decision, reason: `synthetic review operation ${phase}`, traceId,
          metadata: { syntheticOnly: true, phase, reviewerId: reviewer },
        }));
      } catch {
        const error = new Error('review audit unavailable');
        error.code = 'REVIEW_AUDIT_UNAVAILABLE';
        error.traceId = traceId;
        error.operationCompleted = operationCompleted;
        throw error;
      }
    }
    let result;
    try {
      result = await operation({
        identify: (id) => { reviewer = id; },
        allowed: () => log('authorized', 'allowed'),
      });
    } catch (error) {
      if (error?.code !== 'REVIEW_AUDIT_UNAVAILABLE') {
        await log(error?.code === 'REVIEW_FORBIDDEN' ? 'denied' : 'failed',
          error?.code === 'REVIEW_FORBIDDEN' ? 'denied' : 'logged');
      }
      throw error;
    }
    // Completion logging is separate: a failure here must not imply rollback.
    await log('completed', 'logged', true);
    return result;
  }

  return Object.freeze({
    async create(options, session) {
      return audited('tutor_review.create', 'create_review', async ({ identify, allowed }) => {
        const snapshot = JSON.parse(JSON.stringify(options));
        const reviewer = await authorize(session, 'create_review');
        identify(reviewer);
        return store.create({ scorecard: snapshot.scorecard, createdAt: now() }, async () => {
          await authorize(session, 'create_review', reviewer);
          await allowed();
        });
      });
    },
    async adjudicate(options, session) {
      return audited('tutor_review.adjudicate', 'adjudicate_review', async ({ identify, allowed }) => {
        const snapshot = JSON.parse(JSON.stringify(options));
        if (Object.hasOwn(snapshot, 'reviewerId') || Object.hasOwn(snapshot, 'reviewedAt')) {
          throw new TypeError('reviewer identity and decision time are server-controlled');
        }
        const reviewerId = await authorize(session, 'adjudicate_review');
        identify(reviewerId);
        return store.adjudicate({
          reviewId: snapshot.reviewId, scorecard: snapshot.scorecard, status: snapshot.status,
          rationale: snapshot.rationale, requiredActions: snapshot.requiredActions,
          reviewerId, reviewedAt: now(),
        }, async () => {
          await authorize(session, 'adjudicate_review', reviewerId);
          await allowed();
        });
      });
    },
    async history(reviewId, session) {
      return audited('tutor_review.read', 'read_review', async ({ identify, allowed }) => {
        const reviewer = await authorize(session, 'read_review');
        identify(reviewer);
        await allowed();
        const history = await store.history(reviewId);
        await authorize(session, 'read_review', reviewer);
        return history;
      });
    },
  });
}

function denied() {
  const error = new Error('review access denied');
  error.code = 'REVIEW_FORBIDDEN';
  return error;
}
