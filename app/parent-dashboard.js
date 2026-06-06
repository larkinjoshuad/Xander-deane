import { createBrowserSessionStore } from '../src/app/session-persistence.js';
import { createParentDashboardModel } from './parent-insights.js';

const SUBJECTS = [
  { id: 'math', label: 'Math', objective: '../examples/math/objective.learning-objective.json', problem: '../examples/math/problem.problem.json' },
  { id: 'language', label: 'Language', objective: '../examples/language/objective.learning-objective.json', problem: '../examples/language/problem.problem.json' },
  { id: 'science', label: 'Science', objective: '../examples/science/objective.learning-objective.json', problem: '../examples/science/problem.problem.json' },
];

const elements = {
  headline: document.querySelector('#dashboard-headline'),
  subjects: document.querySelector('#overview-subjects'),
  attempts: document.querySelector('#overview-attempts'),
  accuracy: document.querySelector('#overview-accuracy'),
  focus: document.querySelector('#overview-focus'),
  focusReason: document.querySelector('#overview-focus-reason'),
  cards: document.querySelector('#subject-cards'),
};

const sessionStore = createBrowserSessionStore();

bootstrap().catch((error) => {
  elements.headline.textContent = `Unable to load dashboard: ${error.message}`;
  console.error(error);
});

async function bootstrap() {
  const subjects = await Promise.all(SUBJECTS.map(async (subject) => ({
    id: subject.id,
    label: subject.label,
    objective: await fetchJson(subject.objective),
    problem: await fetchJson(subject.problem),
  })));

  const model = createParentDashboardModel({
    subjects,
    sessionStore,
    masteryLookup: loadStoredMastery,
  });

  render(model);
}

function render(model) {
  elements.headline.textContent = model.overall.headline;
  elements.subjects.textContent = `${model.overall.subjectsStarted} of ${model.overall.subjectsTracked}`;
  elements.attempts.textContent = String(model.overall.totalAttempts);
  elements.accuracy.textContent = `${model.overall.overallAccuracy}%`;
  if (model.overall.focus) {
    elements.focus.textContent = model.overall.focus.label;
    elements.focusReason.textContent = model.overall.focus.reason;
  } else {
    elements.focus.textContent = 'All caught up';
    elements.focusReason.textContent = 'Every active subject is ready to advance.';
  }

  elements.cards.replaceChildren(...model.subjects.map(createSubjectCard));
}

function createSubjectCard(card) {
  const article = document.createElement('article');
  article.className = `subject-card${card.started ? '' : ' is-inactive'}`;

  const heading = document.createElement('div');
  heading.className = 'subject-card-heading';
  const title = document.createElement('h3');
  title.textContent = card.label;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = card.started ? formatLabel(card.masteryLevel) : 'Not started';
  heading.append(title, badge);

  const objective = document.createElement('p');
  objective.className = 'subject-card-objective';
  objective.textContent = card.objectiveTitle;

  const stats = document.createElement('dl');
  stats.className = 'subject-card-stats';
  stats.append(
    statPair('Attempts', String(card.attempts)),
    statPair('Correct', String(card.correct)),
    statPair('Accuracy', `${card.accuracy}%`),
    statPair('Confidence', formatLabel(card.confidence)),
  );

  const next = document.createElement('p');
  next.className = 'subject-card-next';
  next.textContent = card.nextStep;

  article.append(heading, objective, stats, next);
  if (card.lastActivity) {
    const meta = document.createElement('p');
    meta.className = 'subject-card-meta';
    meta.textContent = `Last worked ${formatTimestamp(card.lastActivity)}`;
    article.append(meta);
  }
  return article;
}

function statPair(label, value) {
  const wrap = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const desc = document.createElement('dd');
  desc.textContent = value;
  wrap.append(term, desc);
  return wrap;
}

function loadStoredMastery(objectiveId) {
  try {
    const raw = window.localStorage?.getItem(`xander-deane.learning-progress:${objectiveId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatLabel(value) {
  return String(value ?? '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}
