import { mkdir, open, readFile, rename, rm, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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
    if (!packet || Object.keys(packet).sort().join(',') !== 'reviews,scorecard'
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
    return packet;
  }

  async function write(id, action) {
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
    async create(options) {
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
      });
    },
    async adjudicate({ reviewId, ...options }) {
      const snapshot = JSON.parse(JSON.stringify(options));
      return write(reviewId, async () => {
        const packet = await read(reviewId);
        if (packet.reviews.length !== 1) throw conflict('review already finalized');
        const decision = adjudicateTutorQualityReview({ ...snapshot, review: packet.reviews[0] });
        return { ...packet, reviews: [...packet.reviews, decision] };
      });
    },
    async history(reviewId) {
      return (await read(reviewId)).reviews;
    },
  };
}

function conflict(message) {
  const error = new Error(message);
  error.code = 'REVIEW_CONFLICT';
  return error;
}
