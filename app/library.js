import { ACTIVITY_LIBRARY, getActivity, libraryCounts, checkLibraryAnswer, displayChoices, memoryDeck } from '../src/app/activity-library.js';
import { createRecordedVoice, SHANON_CLIPS } from './recorded-voice.js';

const recordedVoice = createRecordedVoice();
const readAloud = document.querySelector('#read-aloud');
const listen = document.querySelector('#listen');
function narrationState(playing) {
  readAloud.textContent = playing ? 'Stop audio' : 'Read aloud';
  listen.setAttribute('aria-pressed', String(playing));
  listen.setAttribute('aria-label', playing ? 'Stop audio' : 'Read question aloud');
  listen.title = playing ? 'Stop audio' : 'Read question aloud';
}
function stopNarration() {
  recordedVoice.stop();
  window.speechSynthesis?.cancel();
  narrationState(false);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopNarration(); });
window.addEventListener('pagehide', stopNarration);

const picker = document.querySelector('#activity');
const board = document.querySelector('#library-board');
const feedback = document.querySelector('#library-feedback');
const params = new URLSearchParams(location.search);
let activity = getActivity(params.get('activity')) ?? ACTIVITY_LIBRARY.find(item => item.subject === params.get('subject')) ?? ACTIVITY_LIBRARY[0];
let index = 0, answer = [], complete = false, exposed = [], matched = [];
let cards = [];
const counts = libraryCounts();
const colors = { red: '#cf414b', blue: '#2867b2', yellow: '#f5ce4d', green: '#3c8a5c', pink: '#e89cbc', orange: '#ed963b' };

function picture(code) {
  const element = document.createElement('span');
  element.className = 'library-visual';
  element.setAttribute('aria-hidden', 'true');
  const [kind, value, size] = code.split(':');
  if (kind === 'object' || kind === 'color') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS(svg.namespaceURI, 'use');
    use.setAttribute('href', kind === 'color' ? './assets/library-play.svg#paint' : `./assets/play-world.svg#${value}`);
    if (kind === 'color') { svg.classList.add('color-swatch'); svg.style.color = colors[value]; }
    svg.append(use);
    element.append(svg);
  } else if (kind === 'dots') {
    for (let n = 0; n < Number(value); n++) { const dot = document.createElement('span'); dot.className = 'count-dot'; element.append(dot); }
  } else {
    const shape = document.createElement('span');
    shape.className = `matching-shape shape-${value}`;
    if (kind === 'size') { const width = { small: 26, medium: 48, large: 70 }[size]; shape.style.setProperty('--shape-size', `${width}px`); }
    element.append(shape);
  }
  return element;
}

function decorate(element, choice) {
  if (choice.visual) element.append(picture(choice.visual));
  else element.textContent = choice.text;
  if (choice.visual?.startsWith('shape:')) {
    element.classList.add('named-shape');
    const caption = document.createElement('span');
    caption.className = 'shape-name';
    caption.textContent = choice.text[0].toUpperCase() + choice.text.slice(1);
    element.append(caption);
  }
}

function buttonFor(choice, label = choice.text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'library-choice';
  button.dataset.choice = choice.id;
  button.setAttribute('aria-label', label);
  decorate(button, choice);
  return button;
}

function render() {
  const focused = board.contains(document.activeElement) ? document.activeElement : null;
  const focusCard = focused?.dataset.card;
  const focusChoice = focused?.dataset.choice;
  const round = activity.rounds[index];
  document.querySelector('#library-prompt').textContent = round.prompt;
  document.querySelector('#round-position').textContent = `${index + 1} of ${activity.rounds.length}`;
  const progress = document.querySelector('#round-progress');
  progress.max = activity.rounds.length;
  progress.value = index + 1;
  document.querySelector('#continue').hidden = !complete || index === activity.rounds.length - 1;
  feedback.classList.toggle('is-complete', complete);
  document.querySelector('#previous').disabled = index === 0;
  document.querySelector('#next').disabled = index === activity.rounds.length - 1;
  document.querySelector('#check').hidden = activity.kind !== 'order' || complete;
  document.querySelector('#undo').hidden = activity.kind !== 'order' || complete;
  document.querySelector('#undo').disabled = !answer.length || complete;
  document.querySelector('#check').disabled = answer.length !== round.answer.length || complete;
  board.replaceChildren();
  if (round.preview) {
    const preview = document.createElement('div');
    preview.className = 'library-preview';
    preview.setAttribute('role', 'img');
    const names = round.preview.map(code => code.split(':')[1]).join(', ');
    preview.setAttribute('aria-label', round.preview.length === 1 ? `Picture: ${names}` : `Pattern: ${names}, what comes next?`);
    preview.append(...round.preview.map(picture));
    board.append(preview);
  }
  if (activity.kind === 'order') {
    const tray = document.createElement('div');
    tray.className = 'library-order';
    tray.dataset.slots = String(round.answer.length);
    tray.style.gridTemplateColumns = `repeat(${round.answer.length}, minmax(0, 1fr))`;
    tray.setAttribute('role', 'group');
    tray.setAttribute('aria-label', 'Your sequence');
    round.answer.forEach((_, position) => {
      const slot = document.createElement('span');
      slot.className = 'order-slot';
      const choice = round.choices.find(item => item.id === answer[position]);
      if (choice) { decorate(slot, choice); slot.setAttribute('aria-label', `${position + 1}: ${choice.text}`); }
      else slot.textContent = String(position + 1);
      tray.append(slot);
    });
    board.append(tray);
  }
  const choices = document.createElement('div');
  choices.className = 'library-choices';
  const columns = round.choices.length === 4 ? 2 : Math.min(3, round.choices.length);
  choices.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  if (activity.kind === 'memory') {
    choices.classList.add('memory-board');
    cards.forEach((choice, cardIndex) => {
      const visible = exposed.includes(cardIndex) || matched.includes(choice.id);
      const button = buttonFor(choice, visible ? choice.text : `Hidden picture ${cardIndex + 1}`);
      button.dataset.card = String(cardIndex);
      button.dataset.hidden = String(!visible);
      button.disabled = matched.includes(choice.id) || exposed.includes(cardIndex);
      if (!visible) { button.replaceChildren(); const back = document.createElement('span'); back.className = 'memory-back'; back.textContent = '?'; back.setAttribute('aria-hidden','true'); button.append(back); }
      if (matched.includes(choice.id)) button.classList.add('correct');
      button.addEventListener('click', () => {
        if (exposed.length === 2) exposed = [];
        exposed.push(cardIndex);
        if (exposed.length === 2) {
          if (cards[exposed[0]].id === cards[exposed[1]].id) {
            matched.push(choice.id);
            exposed = [];
            complete = matched.length === round.choices.length;
            feedback.textContent = complete ? 'All the pairs! Nicely found.' : 'A pair!';
          } else feedback.textContent = 'Two different pictures. Have another look.';
        } else feedback.textContent = 'Where is its partner?';
        render();
      });
      choices.append(button);
    });
  } else displayChoices(round, index).forEach(choice => {
    const button = buttonFor(choice);
    button.disabled = complete || (activity.kind === 'order' && answer.includes(choice.id));
    button.dataset.used = String(!complete && activity.kind === 'order' && answer.includes(choice.id));
    button.setAttribute('aria-pressed', String(answer.includes(choice.id)));
    if (complete && answer.includes(choice.id)) button.classList.add('correct');
    button.addEventListener('click', () => {
      if (activity.kind === 'choice') {
        answer = [choice.id];
        complete = checkLibraryAnswer(activity, index, answer);
        feedback.textContent = complete ? 'You found it!' : 'Take another look. You can try again.';
      } else { answer.push(choice.id); feedback.textContent = ''; }
      render();
    });
    choices.append(button);
  });
  board.append(choices);
  // Rebuilding the board must not leave keyboard users at the document body.
  if (focused) {
    const previous = [...choices.children].find(button => focusCard !== undefined ? button.dataset.card === focusCard : button.dataset.choice === focusChoice);
    const next = complete
      ? document.querySelector(index < activity.rounds.length - 1 ? '#continue' : '#again')
      : (previous && !previous.disabled ? previous : choices.querySelector('button:not(:disabled)') ?? document.querySelector('#check'));
    next?.focus({ preventScroll: true });
  }
}

function reset() { stopNarration(); answer = []; complete = false; exposed = []; matched = []; cards = memoryDeck(activity.rounds[index]); feedback.textContent = ''; render(); }
function choose(id) {
  activity = getActivity(id);
  index = 0;
  const options = ACTIVITY_LIBRARY.filter(item => item.subject === activity.subject);
  picker.replaceChildren(...options.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.title} (${item.rounds.length})`; return option; }));
  picker.value = activity.id;
  const count = counts[activity.subject];
  document.querySelector('#coverage').textContent = `${count.activities} activities / ${count.problems} problems`;
  document.querySelectorAll('[data-subject]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.subject === activity.subject)));
  history.replaceState(null, '', `?subject=${activity.subject}&activity=${activity.id}`);
  reset();
}
document.querySelectorAll('[data-subject]').forEach(button => button.addEventListener('click', () => choose(ACTIVITY_LIBRARY.find(item => item.subject === button.dataset.subject).id)));
picker.addEventListener('change', () => choose(picker.value));
document.querySelector('#previous').addEventListener('click', () => { if (index > 0) { index--; reset(); } });
document.querySelector('#next').addEventListener('click', () => { if (index < activity.rounds.length - 1) { index++; reset(); } });
document.querySelector('#continue').addEventListener('click', () => {
  if (!complete || index >= activity.rounds.length - 1) return;
  index++; reset();
  document.querySelector('#library-prompt').focus({ preventScroll: true });
});
document.querySelector('#again').addEventListener('click', reset);
document.querySelector('#hint').addEventListener('click', () => { feedback.textContent = activity.hint; feedback.classList.remove('is-complete'); });
document.querySelector('#undo').addEventListener('click', () => { answer.pop(); feedback.textContent = ''; render(); });
document.querySelector('#check').addEventListener('click', () => {
  complete = checkLibraryAnswer(activity, index, answer);
  feedback.textContent = complete ? 'That order works!' : 'Take another look. You can change the order.';
  render();
  if (complete) document.querySelector(index < activity.rounds.length - 1 ? '#continue' : '#again').focus({ preventScroll: true });
});
listen.addEventListener('click', () => readAloud.click());
readAloud.addEventListener('click', async () => {
  if (recordedVoice.playing || window.speechSynthesis?.speaking) { stopNarration(); return; }
  const round = activity.rounds[index];
  if (SHANON_CLIPS[round.prompt]) {
    stopNarration();
    narrationState(true);
    try {
      await recordedVoice.play(round.prompt, () => narrationState(false));
    } catch {
      narrationState(false);
      feedback.textContent = 'Audio could not play. Please try again.';
    }
    return;
  }
  if (!('speechSynthesis' in window)) { feedback.textContent = 'Audio is not available on this device.'; return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`${round.prompt} ${round.preview ? round.preview.map(item => item.split(':')[1]).join(', ') : ''}`);
  utterance.rate = .85;
  narrationState(true);
  utterance.onend = () => narrationState(false);
  utterance.onerror = () => narrationState(false);
  window.speechSynthesis.speak(utterance);
});
const menu = document.querySelector('.activity-menu');
document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) menu.open = false; });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
});
choose(activity.id);
