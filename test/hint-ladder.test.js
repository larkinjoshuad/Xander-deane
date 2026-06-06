import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createInitialLearningSession,
  placeSelectedCounter,
  requestHint,
  resetWorkspace,
  selectCounter,
  summarizeHintLadder,
} from '../src/app/learning-session.js';

const objective = readJson('examples/math/objective.learning-objective.json');
const problem = readJson('examples/math/problem.problem.json');
const fixedNow = () => '2026-05-30T00:00:00.000Z';

function attempt(session) {
  const groupId = session.workspaceSnapshot.state.groups[0].id;
  const counterId = session.workspaceSnapshot.state.counters.find((c) => c.groupId === null).id;
  return placeSelectedCounter(selectCounter(session, counterId), groupId, fixedNow);
}

test('first hint gives level 1 and never reveals the answer', () => {
  const session = requestHint(createInitialLearningSession({ objective, problem, now: fixedNow }), fixedNow);
  const ladder = summarizeHintLadder(session);

  assert.equal(ladder.level, 1);
  assert.equal(ladder.hintsRequested, 1);
  assert.equal(session.tutorResponse.feedbackType, 'hint');
  assert.equal(session.tutorResponse.safety.answerRevealed, false);
  assert.match(session.tutorResponse.messageText, /same number of counters/);
});

test('the ladder will not escalate without a genuine attempt between hints', () => {
  const first = requestHint(createInitialLearningSession({ objective, problem, now: fixedNow }), fixedNow);
  const again = requestHint(first, fixedNow);

  assert.equal(summarizeHintLadder(again).level, 1, 'stayed at level 1 without an attempt');
  assert.match(again.tutorResponse.messageText, /Give it a try first/);
});

test('an attempt unlocks the next rung, capped at the policy max, answer always withheld', () => {
  let session = createInitialLearningSession({ objective, problem, now: fixedNow });
  session = requestHint(session, fixedNow);          // L1
  session = requestHint(attempt(session), fixedNow);  // attempt -> L2
  assert.equal(summarizeHintLadder(session).level, 2);
  assert.match(session.tutorResponse.messageText, /Count the counters in one group/);

  session = requestHint(attempt(session), fixedNow);  // attempt -> L3 (max)
  const atMax = summarizeHintLadder(session);
  assert.equal(atMax.level, 3);
  assert.equal(atMax.atMax, true);

  session = requestHint(attempt(session), fixedNow);  // stays at L3
  assert.equal(summarizeHintLadder(session).level, 3);
  assert.equal(session.tutorResponse.safety.answerRevealed, false);

  const hintEvents = session.events.filter((event) => event.type === 'hint_requested');
  assert.equal(hintEvents.length, 4);
  assert.ok(hintEvents.every((event) => event.payload.hintLevel >= 1 && event.payload.hintLevel <= 3));
});

test('resetting the workspace restarts the hint ladder', () => {
  let session = createInitialLearningSession({ objective, problem, now: fixedNow });
  session = requestHint(attempt(requestHint(session, fixedNow)), fixedNow); // L2
  session = resetWorkspace(session, fixedNow);
  assert.equal(summarizeHintLadder(session).level, 0);

  session = requestHint(session, fixedNow);
  assert.equal(summarizeHintLadder(session).level, 1);
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
