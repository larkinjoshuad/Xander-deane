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

  const events = session.events ?? [];
  const hintsUsed = events.filter((event) => event.type === 'hint_requested').length;
  const started = progress.attempts > 0 || events.length > 1;
  // The playbook's north-star signal: getting it right without leaning on hints.
  const unaidedSuccess = progress.correct > 0 && hintsUsed === 0;

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
    hintsUsed,
    unaidedSuccess,
    readyToAdvance: progress.readyToAdvance,
    needsPractice: progress.needsPractice,
    nextStep: progress.attempts === 0
      ? 'Try the activity together, then check an answer.'
      : progress.accuracy < 100
        ? 'Revisit the example together and ask your child to explain their thinking.'
        : 'Ask your child to explain the answer, then try a different example together.',
    started,
    lastActivity: record?.updatedAt ?? null,
  });
}

function summarizeOverall(subjectCards) {
  const started = subjectCards.filter((card) => card.started);
  const totalAttempts = started.reduce((sum, card) => sum + card.attempts, 0);
  const totalCorrect = started.reduce((sum, card) => sum + card.correct, 0);
  const totalHints = started.reduce((sum, card) => sum + card.hintsUsed, 0);
  const unaidedSubjects = started.filter((card) => card.unaidedSuccess).length;
  const overallAccuracy = totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100);

  const focus = chooseFocus(subjectCards);
  return freeze({
    subjectsTracked: subjectCards.length,
    subjectsStarted: started.length,
    totalAttempts,
    totalCorrect,
    totalHints,
    unaidedSubjects,
    overallAccuracy,
    focus,
    headline: buildHeadline({ started, overallAccuracy, focus, total: subjectCards.length }),
  });
}

function chooseFocus(subjectCards) {
  const started = subjectCards.filter((card) => card.started);
  const struggling = started
    .filter((card) => card.attempts > 0 && card.accuracy < 100)
    .sort((left, right) => left.accuracy - right.accuracy)[0];
  if (struggling) {
    return freeze({
      subjectId: struggling.id,
      label: struggling.label,
      reason: `${struggling.accuracy}% accuracy across ${struggling.attempts} checked — keep this in practice rotation.`,
    });
  }
  const unchecked = started.find((card) => card.attempts === 0);
  if (unchecked) {
    return freeze({ subjectId: unchecked.id, label: unchecked.label,
      reason: 'Activity opened, but no answers checked yet. Finish one together.' });
  }
  const notStarted = subjectCards.find((card) => !card.started);
  if (notStarted) {
    return freeze({
      subjectId: notStarted.id,
      label: notStarted.label,
      reason: 'Not started yet — a good one to introduce next.',
    });
  }
  const developing = started.find((card) => !card.readyToAdvance);
  if (developing) {
    return freeze({ subjectId: developing.id, label: developing.label,
      reason: 'A promising start. Check understanding with a different example before moving on.' });
  }
  return null;
}

function buildHeadline({ started, overallAccuracy, focus, total }) {
  if (started.every((card) => card.attempts === 0)) {
    return 'No checked work yet. Start an activity with your child to begin tracking progress.';
  }
  if (!focus) {
    return `Checked work is accurate across ${started.length} subjects. Review understanding together before choosing a new objective.`;
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
