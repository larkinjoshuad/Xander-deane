import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import {
  checkWorkspaceAnswer,
  createInitialLearningSession,
  resetWorkspace,
} from '../src/app/learning-session.js';
import { createBrowserSessionStore, rehydrateLearningSession } from '../src/app/session-persistence.js';
import { renderWorkspaceHost } from '../src/app/workspace-host.js';
import { classificationSortRenderer } from '../app/renderers/classification-sort-renderer.js';
import { equalGroupsRenderer } from '../app/renderers/equal-groups-renderer.js';
import { tokenSelectionRenderer } from '../app/renderers/token-selection-renderer.js';

const mathObjective = readJson('examples/math/objective.learning-objective.json');
const mathProblem = readJson('examples/math/problem.problem.json');
const languageObjective = readJson('examples/language/objective.learning-objective.json');
const languageProblem = readJson('examples/language/problem.problem.json');
const scienceObjective = readJson('examples/science/objective.learning-objective.json');
const scienceProblem = readJson('examples/science/problem.problem.json');
const fixedNow = () => '2026-05-28T00:00:00.000Z';
const previousDocument = globalThis.document;

after(() => {
  globalThis.document = previousDocument;
});

test('DOM flow completes the math equal-groups workspace through renderer clicks', () => {
  let session = createInitialLearningSession({
    objective: mathObjective,
    problem: mathProblem,
    now: fixedNow,
  });
  const { target, render } = createWorkspaceHarness(() => session, (nextSession) => {
    session = nextSession;
    render();
  });

  render();
  const placements = [
    ['counter_1', 'group 1'],
    ['counter_2', 'group 1'],
    ['counter_3', 'group 1'],
    ['counter_4', 'group 1'],
    ['counter_5', 'group 2'],
    ['counter_6', 'group 2'],
    ['counter_7', 'group 2'],
    ['counter_8', 'group 2'],
    ['counter_9', 'group 3'],
    ['counter_10', 'group 3'],
    ['counter_11', 'group 3'],
    ['counter_12', 'group 3'],
  ];

  placements.forEach(([counterId, groupLabel]) => {
    clickElement(findByAttribute(target, 'aria-label', `Select ${counterId}`));
    clickElement(findByAttribute(target, 'aria-label', `Place selected counter into ${groupLabel}`));
  });
  session = checkWorkspaceAnswer(session, fixedNow);

  assert.equal(session.evaluation.isCorrect, true);
  assert.equal(session.events.filter((event) => event.type === 'user_dragged').length, 12);
  assert.deepEqual(session.evaluation.diagnostics.groupSizes, [4, 4, 4]);
});

test('DOM flow reports incorrect math answers and reset clears the workspace', () => {
  let session = createInitialLearningSession({
    objective: mathObjective,
    problem: mathProblem,
    now: fixedNow,
  });
  const { target, render } = createWorkspaceHarness(() => session, (nextSession) => {
    session = nextSession;
    render();
  });

  render();
  clickElement(findByAttribute(target, 'aria-label', 'Select counter_1'));
  clickElement(findByAttribute(target, 'aria-label', 'Place selected counter into group 1'));
  session = checkWorkspaceAnswer(session, fixedNow);

  assert.equal(session.evaluation.isCorrect, false);
  assert.equal(session.tutorResponse.feedbackType, 'hint');
  assert.match(session.tutorResponse.messageText, /Each group needs exactly 4 counters/);
  assert.deepEqual(session.workspaceSnapshot.state.groups.map((group) => group.items.length), [1, 0, 0]);

  session = resetWorkspace(session, fixedNow);
  render();

  assert.equal(session.evaluation, null);
  assert.equal(session.tutorResponse.messageText, 'Workspace reset. Try the problem again.');
  assert.deepEqual(session.workspaceSnapshot.state.groups.map((group) => group.items.length), [0, 0, 0]);
  assert.ok(findByAttribute(target, 'aria-label', 'Select counter_1'));
});

test('DOM flow selects the language action token and evaluates correctly', () => {
  let session = createInitialLearningSession({
    objective: languageObjective,
    problem: languageProblem,
    now: fixedNow,
  });
  const { target, render } = createWorkspaceHarness(() => session, (nextSession) => {
    session = nextSession;
    render();
  });

  render();
  clickElement(findButtonByText(target, 'runs'));
  session = checkWorkspaceAnswer(session, fixedNow);

  assert.equal(session.evaluation.isCorrect, true);
  assert.equal(session.evaluation.diagnostics.selectedToken, 'runs');
  assert.equal(session.events.at(-2).type, 'user_selected');
});

test('DOM flow sorts science classification items and evaluates correctly', () => {
  let session = createInitialLearningSession({
    objective: scienceObjective,
    problem: scienceProblem,
    now: fixedNow,
  });
  const { target, render } = createWorkspaceHarness(() => session, (nextSession) => {
    session = nextSession;
    render();
  });

  render();
  clickElement(findButtonByText(target, 'Duck'));
  clickElement(findByAttribute(target, 'aria-label', 'Place selected item in Feathers'));
  clickElement(findButtonByText(target, 'Eagle'));
  clickElement(findByAttribute(target, 'aria-label', 'Place selected item in Feathers'));
  session = checkWorkspaceAnswer(session, fixedNow);

  assert.equal(session.evaluation.isCorrect, true);
  assert.deepEqual(session.evaluation.diagnostics.sortedItems, ['duck', 'eagle']);
  assert.equal(session.events.filter((event) => event.type === 'user_dragged').length, 2);
});

test('DOM flow activates workspace placement targets with keyboard events', () => {
  let mathSession = createInitialLearningSession({
    objective: mathObjective,
    problem: mathProblem,
    now: fixedNow,
  });
  const mathHarness = createWorkspaceHarness(() => mathSession, (nextSession) => {
    mathSession = nextSession;
    mathHarness.render();
  });

  mathHarness.render();
  clickElement(findByAttribute(mathHarness.target, 'aria-label', 'Select counter_1'));
  const mathKeyEvent = keydownElement(findByAttribute(mathHarness.target, 'aria-label', 'Place selected counter into group 1'), 'Enter');

  assert.equal(mathKeyEvent.defaultPrevented, true);
  assert.deepEqual(mathSession.workspaceSnapshot.state.groups[0].items, ['counter_1']);

  let scienceSession = createInitialLearningSession({
    objective: scienceObjective,
    problem: scienceProblem,
    now: fixedNow,
  });
  const scienceHarness = createWorkspaceHarness(() => scienceSession, (nextSession) => {
    scienceSession = nextSession;
    scienceHarness.render();
  });

  scienceHarness.render();
  clickElement(findButtonByText(scienceHarness.target, 'Duck'));
  const scienceKeyEvent = keydownElement(findByAttribute(scienceHarness.target, 'aria-label', 'Place selected item in Feathers'), ' ');

  assert.equal(scienceKeyEvent.defaultPrevented, true);
  assert.deepEqual(scienceSession.workspaceSnapshot.state.groups[0].items, ['duck']);
});

test('DOM recovery flow rehydrates a persisted workspace before rendering', () => {
  const storage = createFakeStorage();
  const sessionStore = createBrowserSessionStore({ namespace: 'browser-flow', storage, now: fixedNow });
  let session = createInitialLearningSession({
    sessionId: 'ses_browser_flow_recovery_001',
    objective: mathObjective,
    problem: mathProblem,
    now: fixedNow,
  });
  const { target, render } = createWorkspaceHarness(() => session, (nextSession) => {
    session = nextSession;
    sessionStore.saveSession(session);
    render();
  });

  render();
  sessionStore.saveSession(session);
  clickElement(findByAttribute(target, 'aria-label', 'Select counter_1'));
  clickElement(findByAttribute(target, 'aria-label', 'Place selected counter into group 1'));

  const freshSession = createInitialLearningSession({
    sessionId: 'ses_browser_flow_recovery_001',
    objective: mathObjective,
    problem: mathProblem,
    now: fixedNow,
  });
  const storedRecord = sessionStore.loadSession(freshSession.sessionId);
  session = rehydrateLearningSession(freshSession, storedRecord);
  render();

  assert.deepEqual(session.workspaceSnapshot.state.groups[0].items, ['counter_1']);
  assert.equal(storedRecord.snapshotHistory.length, 2);
  assert.ok(findByAttribute(target, 'aria-label', 'Select counter_1'));
});

function createWorkspaceHarness(getSession, onSessionChange) {
  globalThis.document ??= new FakeDocument();
  const target = document.createElement('main');
  const renderers = {
    EqualGroupsWorkspace: equalGroupsRenderer,
    TokenSelectionWorkspace: tokenSelectionRenderer,
    ClassificationSortWorkspace: classificationSortRenderer,
  };

  function render() {
    renderWorkspaceHost({
      session: getSession(),
      renderers,
      target,
      onSessionChange,
    });
  }

  return { target, render };
}

function findButtonByText(root, text) {
  return findElement(root, (element) => element.tagName === 'BUTTON' && element.textContent === text);
}

function findByAttribute(root, name, value) {
  return findElement(root, (element) => element.getAttribute(name) === value);
}

function findElement(root, predicate) {
  const match = walk(root).find(predicate);
  assert.ok(match, `Expected to find element in fake DOM`);
  return match;
}

function walk(root) {
  return [root, ...root.children.flatMap(walk)];
}

function clickElement(element) {
  element.dispatchEvent(createFakeEvent('click'));
}

function keydownElement(element, key) {
  const event = createFakeEvent('keydown', { key });
  element.dispatchEvent(event);
  return event;
}

function createFakeEvent(type, overrides = {}) {
  return {
    type,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...overrides,
  };
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

class FakeElement {
  _className = '';
  _textContent = '';

  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.parentNode = null;
    this.classList = new FakeClassList(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value);
    this.classList.replaceFromString(this._className);
  }

  get textContent() {
    return this.children.length > 0
      ? `${this._textContent}${this.children.map((child) => child.textContent).join('')}`
      : this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  append(...children) {
    children.flat().forEach((child) => {
      if (child === null || child === undefined) return;
      child.parentNode = this;
      this.children.push(child);
    });
  }

  replaceChildren(...children) {
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    (this.listeners.get(event.type) ?? []).forEach((listener) => listener(event));
    return !event.defaultPrevented;
  }
}

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.classes = new Set();
  }

  add(...classNames) {
    classNames.forEach((className) => this.classes.add(className));
    this.sync();
  }

  toggle(className, force) {
    const shouldAdd = force ?? !this.classes.has(className);
    if (shouldAdd) {
      this.classes.add(className);
    } else {
      this.classes.delete(className);
    }
    this.sync();
    return shouldAdd;
  }

  contains(className) {
    return this.classes.has(className);
  }

  replaceFromString(className) {
    this.classes = new Set(String(className).split(/\s+/).filter(Boolean));
  }

  sync() {
    this.element._className = [...this.classes].join(' ');
  }
}

function createFakeStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
