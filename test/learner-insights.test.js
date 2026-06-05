import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createActivityTimeline,
  createGuardianPreviewSummary,
  createLearnerProgressView,
  createRecentSessionSummaries,
  createSkillMasteryForSession,
  describeActivityEvent,
  updateSkillMasteryForSession,
} from '../app/learner-insights.js';
import {
  checkWorkspaceAnswer,
  createInitialLearningSession,
  placeSelectedCounter,
  selectCounter,
} from '../src/app/learning-session.js';
import { createSessionRecord } from '../src/app/session-persistence.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const fixedNow = () => '2026-05-30T00:00:00.000Z';

test('learner progress view summarizes attempts, accuracy, mastery, and next step', () => {
  let session = createInitialLearningSession({ objective, problem, now: fixedNow });
  let mastery = createSkillMasteryForSession(session, { now: fixedNow });
  let record = createSessionRecord(session, { now: fixedNow });

  const initialView = createLearnerProgressView({ session, sessionRecord: record, skillMastery: mastery });
  assert.equal(initialView.attempts, 0);
  assert.equal(initialView.accuracy, 0);
  assert.equal(initialView.masteryLevel, 'not_started');
  assert.match(initialView.nextStep, /start tracking progress/);

  for (let counter = 1; counter <= 12; counter += 1) {
    const groupNumber = Math.ceil(counter / 4);
    session = placeSelectedCounter(selectCounter(session, `counter_${counter}`), `group_${groupNumber}`, fixedNow);
  }
  session = checkWorkspaceAnswer(session, fixedNow);
  mastery = updateSkillMasteryForSession(mastery, session, { now: fixedNow });
  record = createSessionRecord(session, { previousRecord: record, now: fixedNow });

  const completedView = createLearnerProgressView({ session, sessionRecord: record, skillMastery: mastery });
  assert.equal(completedView.attempts, 1);
  assert.equal(completedView.correct, 1);
  assert.equal(completedView.accuracy, 100);
  assert.equal(completedView.masteryLevel, 'developing');
  assert.match(completedView.nextStep, /Great work/);
});


test('recent session summaries sort saved work for intentional resume', () => {
  const olderSession = createInitialLearningSession({
    sessionId: 'ses_recent_older_001',
    objective,
    problem,
    now: fixedNow,
  });
  const newerSession = checkWorkspaceAnswer(createInitialLearningSession({
    sessionId: 'ses_recent_newer_001',
    objective,
    problem,
    now: fixedNow,
  }), fixedNow);
  const olderRecord = createSessionRecord(olderSession, { now: () => '2026-05-29T10:00:00.000Z' });
  const newerRecord = createSessionRecord(newerSession, { now: () => '2026-05-30T10:00:00.000Z' });

  const summaries = createRecentSessionSummaries([olderRecord, newerRecord]);

  assert.deepEqual(summaries.map((summary) => summary.sessionId), ['ses_recent_newer_001', 'ses_recent_older_001']);
  assert.equal(summaries[0].subjectLabel, 'Math');
  assert.equal(summaries[0].workspaceLabel, 'Equal Groups');
  assert.equal(summaries[0].latestResult, 'Last answer needs practice');
  assert.equal(summaries[1].latestResult, 'Not checked yet');
});


test('guardian preview summary turns progress and saved work into adult-facing readiness signals', () => {
  const session = createInitialLearningSession({ objective, problem, now: fixedNow });
  const mastery = createSkillMasteryForSession(session, { now: fixedNow });
  const record = createSessionRecord(session, { now: fixedNow });
  const progressView = createLearnerProgressView({ session, sessionRecord: record, skillMastery: mastery });
  const recentSessions = createRecentSessionSummaries([record]);

  const summary = createGuardianPreviewSummary({ progressView, recentSessions });

  assert.equal(summary.statusLabel, 'Needs practice signal');
  assert.match(summary.progressSummary, /no checked attempts yet/);
  assert.match(summary.consentStatus, /guardian consent required/);
  assert.match(summary.dataStatus, /Local browser storage only/);
  assert.match(summary.auditExportStatus, /1 resumable sessions/);
  assert.match(summary.recommendedAction, /keep this objective/);
});

test('activity timeline translates raw interaction events into learner-friendly labels', () => {
  let session = createInitialLearningSession({ objective, problem, now: fixedNow });
  session = placeSelectedCounter(selectCounter(session, 'counter_1'), 'group_1', fixedNow);
  session = checkWorkspaceAnswer(session, fixedNow);
  const record = createSessionRecord(session, { now: fixedNow });

  const timeline = createActivityTimeline(record);
  assert.equal(timeline[0].label, 'Checked answer and received a hint.');
  assert.equal(timeline[1].label, 'Moved Counter 1 to Group 1.');
  assert.equal(timeline[2].label, 'Started Equal Groups practice.');
  assert.equal(describeActivityEvent({ type: 'unknown_event', payload: {} }), 'Unknown Event recorded.');
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
