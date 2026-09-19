import { PLAY_GAMES, createPlayState, playPieces, dropPlayPiece } from '../src/app/play-together.js';

const world = document.querySelector('#play-world');
const prompt = document.querySelector('#play-prompt');
const feedback = document.querySelector('#play-feedback');
const next = document.querySelector('#next');
const offline = document.querySelector('#offline-play');
const sound = document.querySelector('#sound');
let state = createPlayState();
let selected = null;
let cancelDrag = () => {};
let audioContext;

function art(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `play-art ${className}`);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', `./assets/play-world.svg#${name}`);
  svg.append(use);
  return svg;
}

function speak(text) {
  if (!sound.checked || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function chime() {
  if (!sound.checked) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audioContext ??= new Audio();
    audioContext.resume().catch(() => {});
    [523, 659].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const time = audioContext.currentTime + index * 0.13;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.06, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.24);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  } catch { /* Play remains available when browser audio is unavailable. */ }
}

// Use touch release directly; some browsers omit click after a captured drag.
function activate(button, action) {
  let start;
  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && event.isPrimary) start = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  button.addEventListener('pointercancel', () => { start = null; });
  button.addEventListener('pointerup', event => {
    if (!start || start.id !== event.pointerId) return;
    const tapped = Math.hypot(event.clientX - start.x, event.clientY - start.y) < 12;
    start = null;
    if (tapped && !button.disabled) action(false);
  });
  button.addEventListener('click', event => {
    if (event.pointerType !== 'touch' && !button.disabled) action(event.detail === 0);
  });
}

function place(pieceId, destination, keyboard = false) {
  const updated = dropPlayPiece(state, pieceId, destination);
  if (updated === state) return;
  const accepted = updated.placed.length > state.placed.length;
  state = updated;
  selected = null;
  render();
  if (accepted) chime();
  speak(state.feedback);
  if (keyboard) (world.querySelector('.play-piece') ?? next).focus();
}

function target(id, label, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `play-drop ${className}`;
  button.dataset.drop = id;
  button.setAttribute('aria-label', label);
  activate(button, keyboard => { if (selected) place(selected, id, keyboard); });
  return button;
}

function draggable(piece) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'play-piece';
  button.dataset.piece = piece.id;
  button.setAttribute('aria-label', `${piece.item}${state.game === 'picnic' ? ` ${Number(piece.id.split('-')[1]) + 1}` : ''}`);
  button.setAttribute('aria-pressed', String(selected === piece.id));
  button.append(art(piece.item));
  let gesture, over, suppressClick = false;
  const cleanup = () => {
    const old = gesture;
    gesture = null;
    if (old && button.hasPointerCapture(old.id)) button.releasePointerCapture(old.id);
    button.style.transform = '';
    button.classList.remove('is-moving');
    over?.classList.remove('is-over');
    over = null;
  };
  const select = () => {
    selected = piece.id;
    world.querySelectorAll('.play-piece').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    speak(piece.item);
  };
  button.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    select();
  });
  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    cancelDrag();
    cancelDrag = cleanup;
    suppressClick = false;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const x = event.clientX - gesture.x, y = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(x, y) < 8) return;
    gesture.moved = true;
    button.classList.add('is-moving');
    button.style.transform = `translate(${x}px, ${y}px)`;
    over?.classList.remove('is-over');
    over = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop]');
    over?.classList.add('is-over');
  });
  button.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const moved = gesture.moved;
    const destination = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop]')?.dataset.drop;
    suppressClick = true;
    cleanup();
    if (moved && destination) place(piece.id, destination);
    else if (!moved) select();
  });
  button.addEventListener('pointercancel', cleanup);
  button.addEventListener('lostpointercapture', cleanup);
  button.addEventListener('keydown', event => {
    if (event.key === 'Escape') { cleanup(); selected = null; button.setAttribute('aria-pressed', 'false'); }
  });
  return button;
}

function render() {
  cancelDrag();
  const activity = PLAY_GAMES[state.game][state.round];
  prompt.textContent = activity.prompt;
  feedback.textContent = state.feedback;
  next.disabled = !state.complete;
  next.textContent = state.round === PLAY_GAMES[state.game].length - 1 ? 'Play again' : 'Next';
  document.querySelector('#offline-idea').textContent = activity.offline;
  offline.hidden = !state.complete;
  const scene = document.createElement('div');
  scene.className = 'play-scene';
  scene.append(art('sun', 'play-sun'));
  if (state.game === 'picnic') {
    const plate = target('plate', 'Picnic plate', 'plate');
    const items = document.createElement('span');
    items.className = 'plate-items';
    state.placed.forEach(() => items.append(art('apple')));
    plate.append(items);
    scene.append(plate);
  } else if (state.game === 'pack') {
    const bag = target('bag', 'Backpack', 'bag');
    bag.append(art('bag'));
    if (state.complete) bag.append(art(activity.item, 'packed-object'));
    scene.append(bag);
  } else {
    scene.append(art('hide-scene', 'scene-art'));
    for (const position of ['inside', 'under', 'beside']) {
      const spot = target(position, position === 'inside' ? 'Inside the basket' : `${position} the table`, `hide-spot hide-${position}`);
      if (state.complete && activity.destination === position) {
        spot.append(art('teddy'));
        spot.classList.add('filled');
      }
      scene.append(spot);
    }
    if (state.complete && activity.destination === 'inside') scene.append(art('basket-front', 'scene-art'));
  }
  const pieces = document.createElement('div');
  pieces.className = 'play-pieces';
  pieces.setAttribute('role', 'group');
  pieces.setAttribute('aria-label', 'Play pieces');
  pieces.append(...playPieces(state).map(draggable));
  if (state.complete) {
    const finish = document.createElement('span');
    finish.className = 'play-finish';
    finish.append(art('teddy'));
    pieces.append(finish);
  }
  world.classList.toggle('celebrate', state.complete);
  world.replaceChildren(scene, pieces);
}

function restart(game = state.game, round = state.round) {
  window.speechSynthesis?.cancel();
  state = createPlayState(game, round);
  selected = null;
  document.querySelectorAll('[data-game]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.game === game)));
  render();
  speak(prompt.textContent);
}
document.querySelectorAll('[data-game]').forEach(button => activate(button, () => restart(button.dataset.game, 0)));
activate(document.querySelector('#again'), () => restart());
activate(next, () => restart(state.game, (state.round + 1) % PLAY_GAMES[state.game].length));
activate(document.querySelector('#together'), () => { offline.hidden = false; speak(document.querySelector('#offline-idea').textContent); offline.scrollIntoView({ block: 'nearest' }); });
sound.addEventListener('change', () => {
  if (sound.checked) speak(prompt.textContent);
  else { window.speechSynthesis?.cancel(); audioContext?.suspend().catch(() => {}); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelDrag(); window.speechSynthesis?.cancel(); audioContext?.suspend().catch(() => {}); }
});
render();
