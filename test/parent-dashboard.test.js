import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  checkWorkspaceAnswer,
  createInitialLearningSession,
  placeSelectedCounter,
  selectCounter,
  selectToken,
} from '../src/app/learning-session.js';
import { createBrowserSessionStore } from '../src/app/session-persistence.js';
import { createSkillMasteryForSession, updateSkillMasteryForSession } from '../app/learner-insights.js';
import { createParentDashboardModel } from '../app/parent-insights.js';

const fixedNow = () => '2026-05-30T00:00:00.000Z';
const subjects = [
  { id: 'math', label: 'Math', objective: readJson('examples/math/objective.learning-objective.json'), problem: readJson('examples/math/problem.problem.json') },
  { id: 'language', label: 'Language', objective: readJson('examples/language/objective.learning-objective.json'), problem: readJson('examples/language/problem.problem.json') },
  { id: 'science', label: 'Science', objective: readJson('examples/science/objective.learning-objective.json'), problem: readJson('examples/science/problem.problem.json') },
];

test('parent dashboard rolls up per-subject progress across the learner', () => {
  const store = createBrowserSessionStore({ namespace: 'parent-test', storage: createFakeStorage(), now: fixedNow });
  const masteryByObjective = new Map();

  // Math: one incorrect attempt (struggling).
  seedSubject(store, masteryByObjective, subjects[0], (session) => {
    const selected = selectCounter(session, 'counter_1', fixedNow);
    const groupId = selected.workspaceSnapshot.state.groups[0].id;
    return placeSelectedCounter(selected, groupId, fixedNow);
  });

  // Language: one correct attempt (token "runs" at index 2).
  seedSubject(store, masteryByObjective, subjects[1], (session) => selectToken(session, 2, fixedNow));

  // Science: left untouched (not started).

  const model = createParentDashboardModel({
    subjects,
    sessionStore: store,
    masteryLookup: (objectiveId) => masteryByObjective.get(objectiveId) ?? null,
    now: fixedNow,
  });

  assert.equal(model.overall.subjectsTracked, 3);
  assert.equal(model.overall.subjectsStarted, 2);
  assert.equal(model.overall.totalAttempts, 2);
  assert.equal(model.overall.totalCorrect, 1);
  assert.equal(model.overall.overallAccuracy, 50);
  assert.equal(model.overall.focus.subjectId, 'math');

  const byId = Object.fromEntries(model.subjects.map((card) => [card.id, card]));
  assert.equal(byId.math.attempts, 1);
  assert.equal(byId.math.correct, 0);
  assert.equal(byId.math.started, true);
  assert.equal(byId.language.attempts, 1);
  assert.equal(byId.language.correct, 1);
  assert.equal(byId.science.started, false);
  assert.equal(byId.science.attempts, 0);
});

test('parent dashboard headline reports no work before any activity', () => {
  const store = createBrowserSessionStore({ namespace: 'parent-empty', storage: createFakeStorage(), now: fixedNow });
  const model = createParentDashboardModel({ subjects, sessionStore: store, now: fixedNow });

  assert.equal(model.overall.subjectsStarted, 0);
  assert.match(model.overall.headline, /No checked work yet/);
  assert.equal(model.overall.focus.subjectId, 'math');
});

function seedSubject(store, masteryByObjective, subject, interact) {
  const initial = createInitialLearningSession({ objective: subject.objective, problem: subject.problem, now: fixedNow });
  const checked = checkWorkspaceAnswer(interact(initial), fixedNow);
  const objectiveId = checked.subjectPack.objectives[0].id;
  let mastery = createSkillMasteryForSession(checked, { now: fixedNow });
  mastery = updateSkillMasteryForSession(mastery, checked, { now: fixedNow });
  masteryByObjective.set(objectiveId, mastery);
  store.saveSession(checked);
}

function createFakeStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
