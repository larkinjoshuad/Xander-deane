import {
  createInitialSkillMastery,
  summarizeSkillMastery,
  updateSkillMasteryFromEvaluation,
} from '../src/app/progress-model.js';

export function createSkillMasteryForSession(session, { now = () => new Date().toISOString() } = {}) {
  assertSession(session);
  return createInitialSkillMastery({
    learnerId: session.learnerId,
    objective: session.subjectPack.objectives[0],
    now,
  });
}

export function updateSkillMasteryForSession(skillMastery, session, { now = () => new Date().toISOString() } = {}) {
  assertSession(session);
  if (!session.evaluation) return skillMastery;
  return updateSkillMasteryFromEvaluation(skillMastery, {
    session,
    evaluation: session.evaluation,
    now,
  });
}

export function createLearnerProgressView({ session, sessionRecord, skillMastery }) {
  assertSession(session);
  const masterySummary = summarizeSkillMastery(skillMastery);
  const attempts = masterySummary.attemptCount;
  const correct = masterySummary.correctCount;
  const accuracy = attempts === 0 ? 0 : Math.round((correct / attempts) * 100);
  const snapshotCount = sessionRecord?.snapshotHistory?.length ?? 0;
  const latestEvaluation = sessionRecord?.evaluation ?? session.evaluation ?? null;

  return freezeJson({
    objectiveTitle: session.subjectPack.objectives[0]?.title ?? formatLabel(session.problem.objectiveId),
    subject: session.problem.subject,
    masteryLevel: masterySummary.masteryLevel,
    confidence: masterySummary.confidence,
    attempts,
    correct,
    accuracy,
    snapshotCount,
    readyToAdvance: masterySummary.readyToAdvance,
    needsPractice: masterySummary.needsPractice,
    nextStep: createNextStep({ masterySummary, latestEvaluation }),
  });
}

export function createActivityTimeline(sessionRecord, { limit = 8 } = {}) {
  const events = sessionRecord?.events ?? [];
  return Object.freeze(events
    .slice(-limit)
    .reverse()
    .map((event) => freezeJson({
      id: event.id,
      label: describeActivityEvent(event),
      occurredAt: event.occurredAt,
      type: event.type,
    })));
}


export function createRecentSessionSummaries(sessionRecords, { limit = 5 } = {}) {
  if (!Array.isArray(sessionRecords)) {
    throw new TypeError('sessionRecords must be an array');
  }

  return Object.freeze(sessionRecords
    .filter(Boolean)
    .slice()
    .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))
    .slice(0, limit)
    .map((record) => freezeJson({
      sessionId: record.sessionId,
      subject: record.subject,
      subjectLabel: formatLabel(record.subject),
      workspaceLabel: formatLabel(record.workspaceKind),
      problemId: record.problemId,
      updatedAt: record.updatedAt,
      eventCount: record.events?.length ?? record.metadata?.eventCount ?? 0,
      snapshotCount: record.snapshotHistory?.length ?? record.metadata?.snapshotCount ?? 0,
      latestResult: latestResultLabel(record.evaluation),
    })));
}


export function createGuardianPreviewSummary({ progressView, recentSessions = [], consentRecord = null, localOnly = true }) {
  assertPlainObject(progressView, 'progressView');
  if (!Array.isArray(recentSessions)) {
    throw new TypeError('recentSessions must be an array');
  }

  const savedSessionCount = recentSessions.length;
  const latestSession = recentSessions[0] ?? null;
  const consentStatus = consentRecord?.status === 'granted'
    ? 'Guardian consent on file'
    : 'Demo only: guardian consent required before real learner use';
  const dataStatus = localOnly
    ? 'Local browser storage only; no real learner data is synced'
    : 'Server persistence enabled; verify retention and export settings';
  const progressSummary = progressView.attempts === 0
    ? `${progressView.objectiveTitle}: no checked attempts yet`
    : `${progressView.objectiveTitle}: ${progressView.accuracy}% accuracy across ${progressView.attempts} checked attempts`;

  return freezeJson({
    statusLabel: progressView.readyToAdvance
      ? 'Ready for next activity'
      : progressView.attempts > 0 ? 'Progress captured' : 'Needs practice signal',
    progressSummary,
    consentStatus,
    dataStatus,
    auditExportStatus: `${savedSessionCount} resumable sessions · ${latestSession?.eventCount ?? 0} latest-session events`,
    recommendedAction: progressView.readyToAdvance
      ? 'Preview the explanation with the learner, then assign the next objective.'
      : 'Review the latest work sample and keep this objective in practice rotation.',
  });
}

export function describeActivityEvent(event) {
  assertPlainObject(event, 'event');
  const payload = event.payload ?? {};
  switch (event.type) {
    case 'problem_presented':
      return `Started ${formatLabel(payload.workspaceKind ?? 'workspace')} practice.`;
    case 'user_dragged':
      return payload.counterId
        ? `Moved ${formatReadableId(payload.counterId)} to ${formatReadableId(payload.to)}.`
        : `Sorted ${formatReadableId(payload.itemId)} into ${formatReadableId(payload.to)}.`;
    case 'user_selected':
      return `Selected “${payload.selectedToken ?? 'a token'}.”`;
    case 'answer_checked':
      return payload.isCorrect ? 'Checked answer and got it right.' : 'Checked answer and received a hint.';
    case 'workspace_reset':
      return 'Reset the workspace for another try.';
    default:
      return `${formatLabel(event.type ?? 'activity')} recorded.`;
  }
}


function latestResultLabel(evaluation) {
  if (!evaluation) return 'Not checked yet';
  return evaluation.isCorrect ? 'Last answer correct' : 'Last answer needs practice';
}

function createNextStep({ masterySummary, latestEvaluation }) {
  if (masterySummary.attemptCount === 0) {
    return 'Try the activity, then check your answer to start tracking progress.';
  }
  if (latestEvaluation?.isCorrect || masterySummary.readyToAdvance) {
    return 'Great work. Review the explanation, then try the next recommended activity.';
  }
  return 'Keep practicing this objective and use the tutor hint before checking again.';
}

function formatReadableId(value) {
  return formatLabel(String(value).replace(/_/g, ' '));
}

function formatLabel(value) {
  return String(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function assertSession(session) {
  assertPlainObject(session, 'session');
  assertPlainObject(session.problem, 'session.problem');
  assertPlainObject(session.subjectPack, 'session.subjectPack');
  if (!Array.isArray(session.subjectPack.objectives) || session.subjectPack.objectives.length === 0) {
    throw new TypeError('session.subjectPack.objectives must include at least one objective');
  }
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
}

function freezeJson(value) {
  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
