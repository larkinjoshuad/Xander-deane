import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(
  new URL('../../schemas/audit-event.schema.json', import.meta.url), 'utf8',
)));

export function validateReviewAuditCompletion(event, reviews) {
  if (!validate(event)) throw new TypeError('invalid review audit completion');
  const review = reviews.find((item) => item.id === event.metadata.reviewId);
  const creating = review?.status === 'pending_review';
  if (!review || event.action !== (creating ? 'tutor_review.create' : 'tutor_review.adjudicate')
    || event.permission !== (creating ? 'create_review' : 'adjudicate_review')
    || event.resourceType !== 'tutor_review_collection' || event.resourceId !== 'synthetic_review_collection'
    || event.decision !== 'logged' || event.metadata.phase !== 'completed'
    || event.metadata.syntheticOnly !== true || event.actorAccountId !== null
    || event.learnerId !== null || event.consentScope !== null
    || event.reason !== 'synthetic review operation completed'
    || !/^audit_[a-zA-Z0-9_-]+$/.test(event.id) || !/^review_trace_[a-zA-Z0-9_-]+$/.test(event.traceId)
    || !/^synthetic_reviewer_[a-zA-Z0-9_-]+$/.test(event.metadata.reviewerId)
    || (!creating && event.metadata.reviewerId !== review.reviewerId)
    || Object.keys(event.metadata).sort().join(',') !== 'phase,reviewId,reviewerId,syntheticOnly') {
    throw new TypeError('review audit completion does not match committed evidence');
  }
}
