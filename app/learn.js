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
import { requestLiveTutorResponse } from './tutor-client.js';

// Focused learner experience: split screen — interactive AI on top, problem
// area below. Progress/event tracking is intentionally NOT shown here; it is
// persisted (for the parent dashboard) but kept off the child's screen.

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
  avatarOrb: document.querySelector('#avatar-orb'),
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
let selectedDemo = 'math';
let liveTutorMessage = null;
let tutorRequestToken = 0;
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
      audioUnlocked = true;
      loadDemo(button.dataset.subject);
    });
  });

  elements.checkButton.addEventListener('click', () => {
    audioUnlocked = true;
    const checkedSession = checkWorkspaceAnswer(session);
    const objectiveId = getObjectiveId(checkedSession);
    const updatedMastery = updateSkillMasteryForSession(getSkillMastery(checkedSession), checkedSession);
    skillMasteryByObjectiveId.set(objectiveId, updatedMastery);
    saveSkillMastery(updatedMastery);
    commitSession(checkedSession, { speak: true });
  });

  elements.resetButton.addEventListener('click', () => {
    audioUnlocked = true;
    commitSession(resetWorkspace(session), { speak: true });
  });

  elements.hintButton.addEventListener('click', () => {
    audioUnlocked = true;
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
  liveTutorMessage = null;
  render();
  if (shouldSpeak) speak(currentSpeech());
  void enhanceTutor(session, { speak: shouldSpeak });
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
}

function renderSubjectSwitcher() {
  elements.subjectButtons.forEach((button) => {
    button.classList.toggle('primary', button.dataset.subject === selectedDemo);
  });
}

async function enhanceTutor(currentSession, { speak: shouldSpeak }) {
  const token = ++tutorRequestToken;
  const live = await requestLiveTutorResponse(currentSession);
  if (!live || token !== tutorRequestToken || currentSession !== session) return;
  liveTutorMessage = {
    messageText: live.messageText,
    speechText: typeof live.speechText === 'string' ? live.speechText : live.messageText,
  };
  elements.tutorMessage.textContent = liveTutorMessage.messageText;
  if (shouldSpeak) speak(liveTutorMessage.speechText);
}

function currentSpeech() {
  return liveTutorMessage?.speechText ?? session.tutorResponse.speechText;
}

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.addEventListener('start', () => setAiState('Speaking…', true));
  utterance.addEventListener('end', () => setAiState('Ready', false));
  utterance.addEventListener('error', () => setAiState('Ready', false));
  window.speechSynthesis.speak(utterance);
}

function setAiState(label, speaking) {
  elements.aiState.textContent = label;
  elements.avatarOrb.classList.toggle('is-speaking', speaking);
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
