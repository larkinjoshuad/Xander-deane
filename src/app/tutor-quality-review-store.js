import { mkdir, open, readFile, readdir, rename, rm, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { validateReviewAuditCompletion } from './tutor-review-audit-outbox.js';
import {
  createTutorQualityReview, adjudicateTutorQualityReview, validateTutorQualityReview,
} from './tutor-quality-review.js';

// Single-host synthetic storage; locks deliberately fail closed after a crash.
export function createFileTutorQualityReviewStore({ directory } = {}) {
  if (typeof directory !== 'string' || !directory.trim()) throw new TypeError('directory is required');
  const root = resolve(directory);
  const pathFor = (id) => {
    if (typeof id !== 'string' || !/^review_[a-zA-Z0-9_-]+$/.test(id)) {
      throw new TypeError('invalid pending review ID');
    }
    return join(root, `${id}.json`);
  };

  async function read(id) {
    const packet = JSON.parse(await readFile(pathFor(id), 'utf8'));
    if (!packet || !['reviews,scorecard', 'auditCompletions,reviews,scorecard'].includes(Object.keys(packet).sort().join(','))
      || !Array.isArray(packet.reviews) || ![1, 2].includes(packet.reviews.length)) {
      throw new TypeError('invalid review history');
    }
    const [pending, decision] = packet.reviews;
    for (const review of packet.reviews) validateTutorQualityReview({ review, scorecard: packet.scorecard });
    if (pending.id !== id || pending.status !== 'pending_review'
      || (decision && (decision.status === 'pending_review' || decision.previousReviewId !== id
        || decision.createdAt !== pending.createdAt))) {
      throw new TypeError('invalid review history linkage');
    }
    if (Object.hasOwn(packet, 'auditCompletions')) {
      if (!Array.isArray(packet.auditCompletions) || packet.auditCompletions.length > packet.reviews.length) {
        throw new TypeError('invalid review audit outbox');
      }
      const ids = new Set();
      const reviewIds = new Set();
      for (const event of packet.auditCompletions) {
        validateReviewAuditCompletion(event, packet.reviews);
        if (ids.has(event.id) || reviewIds.has(event.metadata.reviewId)) throw new TypeError('duplicate review audit completion');
        ids.add(event.id);
        reviewIds.add(event.metadata.reviewId);
      }
    }
    return packet;
  }

  async function write(id, action, beforeCommit) {
    const target = pathFor(id);
    const lock = `${target}.lock`;
    const temporary = `${target}.tmp`;
    await mkdir(root, { recursive: true });
    try {
      await mkdir(lock);
    } catch (error) {
      if (error.code === 'EEXIST') throw conflict('review write already in progress');
      throw error;
    }
    try {
      const packet = await action();
      // Recheck trusted authorization under the write lock before persistence.
      if (beforeCommit) {
        const completion = await beforeCommit(packet.reviews.at(-1));
        if (completion !== undefined) {
          validateReviewAuditCompletion(completion, [packet.reviews.at(-1)]);
          packet.auditCompletions = [...(packet.auditCompletions ?? []), completion];
        }
      }
      const handle = await open(temporary, 'w');
      try {
        await handle.writeFile(`${JSON.stringify(packet, null, 2)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, target);
      return packet.reviews.at(-1);
    } finally {
      try { await rm(temporary, { force: true }); } finally { await rmdir(lock); }
    }
  }

  return {
    async create(options, beforeCommit) {
      // Snapshot before the first await so callers cannot change committed evidence.
      const scorecard = JSON.parse(JSON.stringify(options?.scorecard));
      const pending = createTutorQualityReview({ ...options, scorecard });
      return write(pending.id, async () => {
        try {
          await readFile(pathFor(pending.id));
        } catch (error) {
          if (error.code === 'ENOENT') return { scorecard, reviews: [pending] };
          throw error;
        }
        throw conflict('review already exists');
      }, beforeCommit);
    },
    async adjudicate({ reviewId, ...options }, beforeCommit) {
      const snapshot = JSON.parse(JSON.stringify(options));
      return write(reviewId, async () => {
        const packet = await read(reviewId);
        if (packet.reviews.length !== 1) throw conflict('review already finalized');
        const decision = adjudicateTutorQualityReview({ ...snapshot, review: packet.reviews[0] });
        return { ...packet, reviews: [...packet.reviews, decision] };
      }, beforeCommit);
    },
    async history(reviewId) {
      return (await read(reviewId)).reviews;
    },
    // Trusted maintenance only. Stable event IDs support at-least-once delivery.
    async reconcileAuditEvents(auditEventStore) {
      if (typeof auditEventStore?.listAuditEvents !== 'function'
        || typeof auditEventStore?.saveAuditEvent !== 'function') throw new TypeError('readable audit store required');
      await mkdir(root, { recursive: true });
      const lock = join(root, '.audit-reconcile.lock');
      try { await mkdir(lock); } catch (error) {
        if (error.code === 'EEXIST') throw conflict('audit reconciliation already in progress');
        throw error;
      }
      try {
        const completions = [];
        for (const file of await readdir(root)) {
          if (/^review_[a-zA-Z0-9_-]+\.json$/.test(file)) {
            completions.push(...((await read(file.slice(0, -5))).auditCompletions ?? []));
          }
        }
        const existing = [...await auditEventStore.listAuditEvents()];
        let delivered = 0;
        for (const event of completions) {
          const matches = existing.filter((item) => item.id === event.id);
          if (matches.some((item) => !isDeepStrictEqual(item, event))) throw new TypeError('audit event ID collision');
          if (matches.length) continue;
          await auditEventStore.saveAuditEvent(event);
          existing.push(event);
          delivered++;
        }
        return { delivered, inspected: completions.length };
      } finally { await rmdir(lock); }
    },
  };
}

function conflict(message) {
  const error = new Error(message);
  error.code = 'REVIEW_CONFLICT';
  return error;
}
