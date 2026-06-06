import {
  checkWorkspaceAnswer,
  createInitialLearningSession,
  resetWorkspace,
} from '../src/app/learning-session.js';
import { renderWorkspaceHost } from '../src/app/workspace-host.js';
import {
  applyDeviceProfileToDocument,
  inferBrowserDeviceProfile,
  resolveResponsiveLayout,
} from '../src/app/device-profile.js';
import {
  createBrowserSessionStore,
  rehydrateLearningSession,
} from '../src/app/session-persistence.js';
import { equalGroupsRenderer } from './renderers/equal-groups-renderer.js';
import { classificationSortRenderer } from './renderers/classification-sort-renderer.js';
import { tokenSelectionRenderer } from './renderers/token-selection-renderer.js';
import {
  createActivityTimeline,
  createGuardianPreviewSummary,
  createLearnerProgressView,
  createRecentSessionSummaries,
  createSkillMasteryForSession,
  updateSkillMasteryForSession,
} from './learner-insights.js';
import { requestLiveTutorResponse } from './tutor-client.js';

const DEMOS = Object.freeze({
  math: {
    objective: '../examples/math/objective.learning-objective.json',
    problem: '../examples/math/problem.problem.json',
  },
  language: {
    objective: '../examples/language/objective.learning-objective.json',
    problem: '../examples/language/problem.problem.json',
  },
  science: {
    objective: '../examples/science/objective.learning-objective.json',
    problem: '../examples/science/problem.problem.json',
  },
});

const workspaceRenderers = Object.freeze({
  EqualGroupsWorkspace: equalGroupsRenderer,
  TokenSelectionWorkspace: tokenSelectionRenderer,
  ClassificationSortWorkspace: classificationSortRenderer,
});

const elements = {
  feedbackType: document.querySelector('#feedback-type'),
  tutorMessage: document.querySelector('#tutor-message'),
  speakButton: document.querySelector('#speak-button'),
  resetButton: document.querySelector('#reset-button'),
  checkButton: document.querySelector('#check-button'),
  mathDemoButton: document.querySelector('#math-demo-button'),
  languageDemoButton: document.querySelector('#language-demo-button'),
  scienceDemoButton: document.querySelector('#science-demo-button'),
  deviceStatus: document.querySelector('#device-status'),
  problemPrompt: document.querySelector('#problem-prompt'),
  workspaceRoot: document.querySelector('#workspace-root'),
  eventCount: document.querySelector('#event-count'),
  eventLog: document.querySelector('#event-log'),
  masteryStatus: document.querySelector('#mastery-status'),
  progressObjective: document.querySelector('#progress-objective'),
  progressAttempts: document.querySelector('#progress-attempts'),
  progressAccuracy: document.querySelector('#progress-accuracy'),
  progressSnapshots: document.querySelector('#progress-snapshots'),
  progressNextStep: document.querySelector('#progress-next-step'),
  recentSessionCount: document.querySelector('#recent-session-count'),
  recentSessionList: document.querySelector('#recent-session-list'),
  guardianPreviewStatus: document.querySelector('#guardian-preview-status'),
  guardianPreviewList: document.querySelector('#guardian-preview-list'),
};

const sessionStore = createBrowserSessionStore();
const skillMasteryByObjectiveId = new Map();
let activeSessionRecord = null;
let session;
let liveTutorMessage = null;
let tutorRequestToken = 0;
let selectedDemo = 'math';
let deviceProfile = inferBrowserDeviceProfile(window);
let responsiveLayout = resolveResponsiveLayout(deviceProfile);

bootstrap().catch((error) => {
  elements.feedbackType.textContent = 'Unable to load session';
  elements.tutorMessage.textContent = error.message;
  console.error(error);
});

async function bootstrap() {
  applyDeviceProfile();
  bindGlobalActions();
  await loadDemo(selectedDemo);
}

function bindGlobalActions() {
  elements.mathDemoButton.addEventListener('click', () => loadDemo('math'));
  elements.languageDemoButton.addEventListener('click', () => loadDemo('language'));
  elements.scienceDemoButton.addEventListener('click', () => loadDemo('science'));
  window.addEventListener('resize', () => {
    applyDeviceProfile();
    renderDeviceStatus();
  });

  elements.checkButton.addEventListener('click', () => {
    const checkedSession = checkWorkspaceAnswer(session);
    const objectiveId = getObjectiveId(checkedSession);
    const previousMastery = getSkillMastery(checkedSession);
    const updatedMastery = updateSkillMasteryForSession(previousMastery, checkedSession);
    skillMasteryByObjectiveId.set(objectiveId, updatedMastery);
    saveSkillMastery(updatedMastery);
    commitSession(checkedSession);
  });

  elements.resetButton.addEventListener('click', () => {
    commitSession(resetWorkspace(session));
  });

  elements.speakButton.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const speechText = liveTutorMessage?.speechText ?? session.tutorResponse.speechText;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(speechText));
  });
}

async function loadDemo(demoId, { forceFresh = false } = {}) {
  selectedDemo = demoId;
  const demo = DEMOS[demoId];
  const [objective, problem] = await Promise.all([
    fetchJson(demo.objective),
    fetchJson(demo.problem),
  ]);

  const initialSession = createInitialLearningSession({ objective, problem });
  const objectiveId = getObjectiveId(initialSession);
  skillMasteryByObjectiveId.set(objectiveId, loadSkillMastery(initialSession));
  const storedRecord = forceFresh ? null : sessionStore.loadSession(initialSession.sessionId);
  session = storedRecord ? rehydrateLearningSession(initialSession, storedRecord) : initialSession;
  commitSession(session);
}

function commitSession(nextSession) {
  session = nextSession;
  activeSessionRecord = sessionStore.saveSession(session);
  liveTutorMessage = null;
  render();
  void enhanceTutorPanel(session);
}

// Opt-in progressive enhancement: when the live tutor endpoint is configured,
// replace the deterministic message with a real, adaptive one once it arrives.
// No-ops (and never touches the DOM) when the live tutor is disabled.
async function enhanceTutorPanel(currentSession) {
  const token = ++tutorRequestToken;
  const live = await requestLiveTutorResponse(currentSession);
  if (!live || token !== tutorRequestToken || currentSession !== session) {
    return;
  }
  liveTutorMessage = {
    feedbackType: live.feedbackType,
    messageText: live.messageText,
    speechText: typeof live.speechText === 'string' ? live.speechText : live.messageText,
  };
  elements.feedbackType.textContent = formatLabel(liveTutorMessage.feedbackType);
  elements.tutorMessage.textContent = liveTutorMessage.messageText;
}

function render() {
  renderDeviceStatus();
  renderSubjectSwitcher();
  renderRecentSessions();
  renderTutorPanel();
  renderProgressDashboard();
  renderGuardianPreview();
  renderWorkspaceHost({
    session,
    renderers: workspaceRenderers,
    target: elements.workspaceRoot,
    onSessionChange: commitSession,
  });
  renderEventLog();
}

function applyDeviceProfile() {
  deviceProfile = inferBrowserDeviceProfile(window);
  responsiveLayout = resolveResponsiveLayout(deviceProfile);
  applyDeviceProfileToDocument(document, deviceProfile);
}

function renderDeviceStatus() {
  elements.deviceStatus.textContent = `${formatLabel(deviceProfile.category)} · ${formatLabel(deviceProfile.presentationMode)} · ${responsiveLayout.minimumTargetSize}px targets`;
}

function renderSubjectSwitcher() {
  elements.mathDemoButton.classList.toggle('primary', selectedDemo === 'math');
  elements.languageDemoButton.classList.toggle('primary', selectedDemo === 'language');
  elements.scienceDemoButton.classList.toggle('primary', selectedDemo === 'science');
}

function renderTutorPanel() {
  elements.feedbackType.textContent = formatLabel(session.tutorResponse.feedbackType);
  elements.tutorMessage.textContent = session.tutorResponse.messageText;
  elements.problemPrompt.textContent = session.problem.prompt;
}

function renderRecentSessions() {
  const summaries = createRecentSessionSummaries(sessionStore.listSessions());
  elements.recentSessionCount.textContent = `${summaries.length} saved`;
  if (summaries.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'recent-session-empty';
    emptyItem.textContent = 'No saved work yet. Start an activity to create a resumable session.';
    elements.recentSessionList.replaceChildren(emptyItem);
    return;
  }

  elements.recentSessionList.replaceChildren(
    ...summaries.map((summary) => createRecentSessionItem(summary)),
  );
}

function createRecentSessionItem(summary) {
  const item = document.createElement('li');
  item.className = 'recent-session-item';

  const details = document.createElement('div');
  details.className = 'recent-session-details';

  const title = document.createElement('strong');
  title.textContent = `${summary.subjectLabel}: ${summary.workspaceLabel}`;
  const meta = document.createElement('span');
  meta.textContent = `${summary.latestResult} · ${summary.eventCount} events · ${summary.snapshotCount} snapshots`;
  const saved = document.createElement('span');
  saved.textContent = `Saved ${formatTimestamp(summary.updatedAt)}`;
  details.append(title, meta, saved);

  const actions = document.createElement('div');
  actions.className = 'recent-session-actions';
  const resumeButton = document.createElement('button');
  resumeButton.type = 'button';
  resumeButton.className = 'primary';
  resumeButton.textContent = 'Resume';
  resumeButton.setAttribute('aria-label', `Resume ${summary.subjectLabel} session`);
  resumeButton.addEventListener('click', () => loadDemo(demoIdForSessionSummary(summary)));

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'Clear';
  clearButton.setAttribute('aria-label', `Clear ${summary.subjectLabel} session`);
  clearButton.addEventListener('click', () => clearRecentSession(summary));

  actions.append(resumeButton, clearButton);
  item.append(details, actions);
  return item;
}

function clearRecentSession(summary) {
  sessionStore.clearSession(summary.sessionId);
  if (activeSessionRecord?.sessionId === summary.sessionId) {
    loadDemo(selectedDemo, { forceFresh: true });
    return;
  }
  renderRecentSessions();
}

function getCurrentProgressView() {
  return createLearnerProgressView({
    session,
    sessionRecord: activeSessionRecord,
    skillMastery: getSkillMastery(session),
  });
}

function renderProgressDashboard() {
  const progress = getCurrentProgressView();
  elements.masteryStatus.textContent = formatLabel(progress.masteryLevel);
  elements.progressObjective.textContent = progress.objectiveTitle;
  elements.progressAttempts.textContent = `${progress.attempts} checked · ${progress.correct} correct`;
  elements.progressAccuracy.textContent = `${progress.accuracy}% · ${formatLabel(progress.confidence)} confidence`;
  elements.progressSnapshots.textContent = `${progress.snapshotCount} snapshots saved`;
  elements.progressNextStep.textContent = progress.nextStep;
}

function renderGuardianPreview() {
  const progress = getCurrentProgressView();
  const summary = createGuardianPreviewSummary({
    progressView: progress,
    recentSessions: createRecentSessionSummaries(sessionStore.listSessions()),
  });
  elements.guardianPreviewStatus.textContent = summary.statusLabel;
  elements.guardianPreviewList.replaceChildren(
    createSummaryItem(summary.progressSummary),
    createSummaryItem(summary.consentStatus),
    createSummaryItem(summary.dataStatus),
    createSummaryItem(summary.auditExportStatus),
    createSummaryItem(summary.recommendedAction),
  );
}

function createSummaryItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

function renderEventLog() {
  const snapshotCount = activeSessionRecord?.snapshotHistory.length ?? 0;
  elements.eventCount.textContent = `${session.events.length} events · ${snapshotCount} snapshots saved`;
  const activityItems = createActivityTimeline(activeSessionRecord, { limit: 8 });
  elements.eventLog.replaceChildren(
    ...activityItems.map((activity) => {
      const item = document.createElement('li');
      item.textContent = activity.label;
      return item;
    }),
  );
}

function demoIdForSessionSummary(summary) {
  return Object.keys(DEMOS).find((demoId) => demoId === summary.subject) ?? selectedDemo;
}

function formatTimestamp(value) {
  if (!value) return 'just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getSkillMastery(currentSession) {
  const objectiveId = getObjectiveId(currentSession);
  const existingMastery = skillMasteryByObjectiveId.get(objectiveId);
  if (existingMastery) return existingMastery;
  const initialMastery = createSkillMasteryForSession(currentSession);
  skillMasteryByObjectiveId.set(objectiveId, initialMastery);
  return initialMastery;
}

function loadSkillMastery(currentSession) {
  const objectiveId = getObjectiveId(currentSession);
  const rawMastery = window.localStorage?.getItem(progressKey(objectiveId));
  if (rawMastery) return JSON.parse(rawMastery);
  return createSkillMasteryForSession(currentSession);
}

function saveSkillMastery(skillMastery) {
  window.localStorage?.setItem(progressKey(skillMastery.objectiveId), JSON.stringify(skillMastery));
}

function getObjectiveId(currentSession) {
  return currentSession.subjectPack.objectives[0].id;
}

function progressKey(objectiveId) {
  return `xander-deane.learning-progress:${objectiveId}`;
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

function formatLabel(value) {
  return value
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}
