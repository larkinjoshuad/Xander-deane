import {
  checkWorkspaceAnswer,
  createInitialLearningSession,
  requestHint,
  resetWorkspace,
} from '../src/app/learning-session.js';
import { renderWorkspaceHost } from '../src/app/workspace-host.js';
import {
  applyDeviceProfileToDocument,
  inferBrowserDeviceProfile,
} from '../src/app/device-profile.js';
import {
  createBrowserSessionStore,
  rehydrateLearningSession,
} from '../src/app/session-persistence.js';
import { equalGroupsRenderer } from './renderers/equal-groups-renderer.js';
import { classificationSortRenderer } from './renderers/classification-sort-renderer.js';
import { tokenSelectionRenderer } from './renderers/token-selection-renderer.js';
import { createSkillMasteryForSession, updateSkillMasteryForSession } from './learner-insights.js';

// Synthetic touch practice keeps progress available only in the family view.

const DEMOS = Object.freeze({
  math: { objective: '../examples/math/objective.learning-objective.json', problem: '../examples/math/problem.problem.json' },
  language: { objective: '../examples/language/objective.learning-objective.json', problem: '../examples/language/problem.problem.json' },
  science: { objective: '../examples/science/objective.learning-objective.json', problem: '../examples/science/problem.problem.json' },
});

const workspaceRenderers = Object.freeze({
  EqualGroupsWorkspace: equalGroupsRenderer,
  TokenSelectionWorkspace: tokenSelectionRenderer,
  ClassificationSortWorkspace: classificationSortRenderer,
});

const elements = {
  tutorMessage: document.querySelector('#tutor-message'),
  speakButton: document.querySelector('#speak-button'),
  aiState: document.querySelector('#ai-state'),
  problemPrompt: document.querySelector('#problem-prompt'),
  workspaceRoot: document.querySelector('#workspace-root'),
  checkButton: document.querySelector('#check-button'),
  resetButton: document.querySelector('#reset-button'),
  hintButton: document.querySelector('#hint-button'),
  subjectButtons: Array.from(document.querySelectorAll('[data-subject]')),
};

const sessionStore = createBrowserSessionStore();
const skillMasteryByObjectiveId = new Map();
let session;
let activeSessionRecord = null;
const requestedSubject = new URLSearchParams(window.location.search).get('subject');
let selectedDemo = Object.hasOwn(DEMOS, requestedSubject) ? requestedSubject : 'math';
let audioUnlocked = false;

bootstrap().catch((error) => {
  elements.tutorMessage.textContent = `Something went wrong loading the lesson: ${error.message}`;
  console.error(error);
});

async function bootstrap() {
  applyDeviceProfileToDocument(document, inferBrowserDeviceProfile(window));
  bindActions();
  await loadDemo(selectedDemo);
}

function bindActions() {
  elements.subjectButtons.forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelector('.activity-menu').open = false;
      loadDemo(button.dataset.subject);
    });
  });

  elements.checkButton.addEventListener('click', () => {
    const checkedSession = checkWorkspaceAnswer(session);
    const objectiveId = getObjectiveId(checkedSession);
    const updatedMastery = updateSkillMasteryForSession(getSkillMastery(checkedSession), checkedSession);
    skillMasteryByObjectiveId.set(objectiveId, updatedMastery);
    saveSkillMastery(updatedMastery);
    commitSession(checkedSession, { speak: true });
  });

  elements.resetButton.addEventListener('click', () => {
    commitSession(resetWorkspace(session), { speak: true });
  });

  elements.hintButton.addEventListener('click', () => {
    commitSession(requestHint(session), { speak: true });
  });

  elements.speakButton.addEventListener('click', () => {
    audioUnlocked = true;
    speak(currentSpeech());
  });
}

async function loadDemo(demoId) {
  selectedDemo = demoId;
  const demo = DEMOS[demoId];
  const [objective, problem] = await Promise.all([fetchJson(demo.objective), fetchJson(demo.problem)]);

  const initialSession = createInitialLearningSession({ objective, problem });
  skillMasteryByObjectiveId.set(getObjectiveId(initialSession), loadSkillMastery(initialSession));
  const storedRecord = sessionStore.loadSession(initialSession.sessionId);
  session = storedRecord ? rehydrateLearningSession(initialSession, storedRecord) : initialSession;
  commitSession(session, { speak: audioUnlocked });
}

function commitSession(nextSession, { speak: shouldSpeak = false } = {}) {
  session = nextSession;
  activeSessionRecord = sessionStore.saveSession(session);
  render();
  if (shouldSpeak) speak(currentSpeech());
}

function render() {
  renderSubjectSwitcher();
  elements.tutorMessage.textContent = session.tutorResponse.messageText;
  elements.problemPrompt.textContent = session.problem.prompt;
  renderWorkspaceHost({
    session,
    renderers: workspaceRenderers,
    target: elements.workspaceRoot,
    onSessionChange: (next) => commitSession(next),
  });
  elements.workspaceRoot.querySelectorAll('h3, h4').forEach((heading) => heading.setAttribute('aria-level', '2'));
}

function renderSubjectSwitcher() {
  elements.subjectButtons.forEach((button) => {
    button.classList.toggle('primary', button.dataset.subject === selectedDemo);
    button.setAttribute('aria-pressed', String(button.dataset.subject === selectedDemo));
  });
}

function currentSpeech() {
  return session.tutorResponse.speechText;
}

function speak(text) {
  if (!audioUnlocked || !('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.addEventListener('start', () => setAiState('Speaking…', true));
  utterance.addEventListener('end', () => setAiState('Ready', false));
  utterance.addEventListener('error', () => setAiState('Ready', false));
  window.speechSynthesis.speak(utterance);
}

function setAiState(label) {
  elements.aiState.textContent = label;
}

function getSkillMastery(currentSession) {
  const objectiveId = getObjectiveId(currentSession);
  const existing = skillMasteryByObjectiveId.get(objectiveId);
  if (existing) return existing;
  const initial = createSkillMasteryForSession(currentSession);
  skillMasteryByObjectiveId.set(objectiveId, initial);
  return initial;
}

function loadSkillMastery(currentSession) {
  const objectiveId = getObjectiveId(currentSession);
  try {
    const raw = window.localStorage?.getItem(progressKey(objectiveId));
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore storage errors
  }
  return createSkillMasteryForSession(currentSession);
}

function saveSkillMastery(skillMastery) {
  try {
    window.localStorage?.setItem(progressKey(skillMastery.objectiveId), JSON.stringify(skillMastery));
  } catch {
    // ignore storage errors
  }
}

function getObjectiveId(currentSession) {
  return currentSession.subjectPack.objectives[0].id;
}

function progressKey(objectiveId) {
  return `xander-deane.learning-progress:${objectiveId}`;
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json();
}
