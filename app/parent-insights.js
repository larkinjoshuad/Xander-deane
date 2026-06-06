import { createInitialLearningSession } from '../src/app/learning-session.js';
import { rehydrateLearningSession } from '../src/app/session-persistence.js';
import { createLearnerProgressView, createSkillMasteryForSession } from './learner-insights.js';

/**
 * Builds the parent/educator dashboard model: a cross-subject roll-up of one
 * learner's progress, assembled read-only from persisted sessions and the
 * per-objective skill mastery the learner shell already writes.
 *
 * Pure and dependency-injected (sessionStore + masteryLookup) so it can be
 * unit-tested without a browser. Today it covers a single child; a child
 * selector slots in by namespacing `sessionStore` / `masteryLookup`.
 */
export function createParentDashboardModel({
  subjects,
  sessionStore,
  masteryLookup = () => null,
  now = () => new Date().toISOString(),
}) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new TypeError('subjects must be a non-empty array');
  }
  if (!sessionStore || typeof sessionStore.loadSession !== 'function') {
    throw new TypeError('sessionStore with loadSession is required');
  }

  const subjectCards = subjects.map((subject) => buildSubjectCard({ subject, sessionStore, masteryLookup, now }));
  return freeze({
    generatedAt: now(),
    subjects: subjectCards,
    overall: summarizeOverall(subjectCards),
  });
}

function buildSubjectCard({ subject, sessionStore, masteryLookup, now }) {
  const { id, label, objective, problem } = subject;
  const initialSession = createInitialLearningSession({ objective, problem, now });
  const objectiveId = initialSession.subjectPack.objectives[0].id;

  const record = sessionStore.loadSession(initialSession.sessionId) ?? null;
  const session = record ? rehydrateLearningSession(initialSession, record) : initialSession;
  const skillMastery = masteryLookup(objectiveId) ?? createSkillMasteryForSession(session, { now });
  const progress = createLearnerProgressView({ session, sessionRecord: record, skillMastery });

  const started = progress.attempts > 0 || (record?.events?.length ?? 0) > 0;
  return freeze({
    id,
    label: label ?? capitalize(progress.subject ?? id),
    objectiveId,
    objectiveTitle: progress.objectiveTitle,
    masteryLevel: progress.masteryLevel,
    confidence: progress.confidence,
    attempts: progress.attempts,
    correct: progress.correct,
    accuracy: progress.accuracy,
    readyToAdvance: progress.readyToAdvance,
    needsPractice: progress.needsPractice,
    nextStep: progress.nextStep,
    started,
    lastActivity: record?.updatedAt ?? null,
  });
}

function summarizeOverall(subjectCards) {
  const started = subjectCards.filter((card) => card.started);
  const totalAttempts = started.reduce((sum, card) => sum + card.attempts, 0);
  const totalCorrect = started.reduce((sum, card) => sum + card.correct, 0);
  const overallAccuracy = totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100);

  const focus = chooseFocus(subjectCards);
  return freeze({
    subjectsTracked: subjectCards.length,
    subjectsStarted: started.length,
    totalAttempts,
    totalCorrect,
    overallAccuracy,
    focus,
    headline: buildHeadline({ started, overallAccuracy, focus, total: subjectCards.length }),
  });
}

function chooseFocus(subjectCards) {
  const started = subjectCards.filter((card) => card.started);
  const struggling = started
    .filter((card) => card.needsPractice || card.accuracy < 100)
    .sort((left, right) => left.accuracy - right.accuracy)[0];
  if (struggling) {
    return freeze({
      subjectId: struggling.id,
      label: struggling.label,
      reason: `${struggling.accuracy}% accuracy across ${struggling.attempts} checked — keep this in practice rotation.`,
    });
  }
  const notStarted = subjectCards.find((card) => !card.started);
  if (notStarted) {
    return freeze({
      subjectId: notStarted.id,
      label: notStarted.label,
      reason: 'Not started yet — a good one to introduce next.',
    });
  }
  return null;
}

function buildHeadline({ started, overallAccuracy, focus, total }) {
  if (started.length === 0) {
    return 'No checked work yet. Start an activity with your child to begin tracking progress.';
  }
  if (!focus) {
    return `Strong across all ${started.length} active subjects (${overallAccuracy}% accuracy). Ready to advance.`;
  }
  return `${started.length} of ${total} subjects active · ${overallAccuracy}% overall accuracy · focus on ${focus.label}.`;
}

function capitalize(value) {
  const text = String(value ?? '');
  return text.length === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function freeze(value) {
  return Object.freeze(value);
}
