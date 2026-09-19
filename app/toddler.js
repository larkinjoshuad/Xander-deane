import { MATCHING_SETS, matchingRound, isMatchingDrop, matchingVisual } from '../src/app/toddler-matching.js';

const board = document.querySelector('#matching-board');
const feedback = document.querySelector('#matching-feedback');
const next = document.querySelector('#matching-next');
let mode = 'letters', round = 0, matched = [], selected = false;
let cancelGesture = () => {};

function drawSymbol(element, symbol) {
  const visual = matchingVisual(mode, symbol);
  if (visual.shape) {
    const shape = document.createElement('span');
    shape.className = `matching-shape shape-${visual.shape} size-${visual.size}`;
    shape.setAttribute('aria-hidden', 'true');
    if (mode === 'shapes') {
      element.classList.add('named-shape');
      const picture = document.createElement('span');
      picture.className = 'shape-picture';
      picture.append(shape);
      const caption = document.createElement('span');
      caption.className = 'shape-name';
      caption.textContent = visual.label[0].toUpperCase() + visual.label.slice(1);
      element.append(picture, caption);
    } else element.append(shape);
  } else element.textContent = symbol;
  return visual.label;
}

function place(destination) {
  const symbols = matchingRound(mode, round);
  const symbol = symbols.find(value => !matched.includes(value));
  if (!isMatchingDrop(symbols, symbol, destination)) {
    feedback.textContent = mode === 'sizes' ? 'Try the same size.' : 'Try the same shape.';
    return;
  }
  matched.push(symbol);
  selected = false;
  feedback.textContent = matched.length === symbols.length ? 'You matched them!' : 'A match!';
  render();
}

function render() {
  cancelGesture();
  const symbols = matchingRound(mode, round);
  const targets = document.createElement('div');
  targets.className = 'matching-targets';
  // Reverse targets so matching is based on shape rather than always the first position.
  [...symbols].reverse().forEach(symbol => {
    const target = document.createElement('button');
    target.type = 'button';
    target.className = 'matching-target';
    target.classList.toggle('is-matched', matched.includes(symbol));
    const label = drawSymbol(target, symbol);
    target.dataset.match = symbol;
    target.setAttribute('aria-label', `${label} target${matched.includes(symbol) ? ', matched' : ''}`);
    target.addEventListener('click', () => { if (selected) place(symbol); });
    targets.append(target);
  });
  const slot = document.createElement('div');
  slot.className = 'matching-piece-slot';
  const symbol = symbols.find(value => !matched.includes(value));
  next.disabled = symbol !== undefined;
  if (symbol !== undefined) {
    const piece = document.createElement('button');
    piece.type = 'button';
    piece.className = 'matching-piece';
    const label = drawSymbol(piece, symbol);
    piece.setAttribute('aria-label', `Match ${label}`);
    piece.setAttribute('aria-pressed', String(selected));
    let gesture = null, over = null, suppressClick = false;
    const select = () => { selected = true; piece.setAttribute('aria-pressed', 'true'); };
    cancelGesture = () => {
      if (gesture && piece.hasPointerCapture(gesture.id)) piece.releasePointerCapture(gesture.id);
      gesture = null;
      piece.style.transform = '';
      piece.classList.remove('is-moving');
      over?.classList.remove('is-over');
      over = null;
    };
    piece.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      select();
    });
    piece.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      suppressClick = false;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      piece.setPointerCapture(event.pointerId);
    });
    piece.addEventListener('pointermove', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const x = event.clientX - gesture.x, y = event.clientY - gesture.y;
      if (!gesture.moved && Math.hypot(x, y) < 8) return;
      gesture.moved = true;
      piece.classList.add('is-moving');
      piece.style.transform = `translate(${x}px, ${y}px)`;
      over?.classList.remove('is-over');
      over = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-match]');
      over?.classList.add('is-over');
    });
    piece.addEventListener('pointerup', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const moved = gesture.moved;
      const destination = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-match]')?.dataset.match;
      suppressClick = true;
      cancelGesture();
      if (moved && destination) place(destination);
      else if (!moved) select();
    });
    piece.addEventListener('pointercancel', cancelGesture);
    piece.addEventListener('lostpointercapture', cancelGesture);
    piece.addEventListener('keydown', event => { if (event.key === 'Escape') cancelGesture(); });
    slot.append(piece);
  } else {
    const done = document.createElement('span');
    done.className = 'matching-complete';
    done.textContent = '\u2713';
    done.setAttribute('aria-label', 'Round complete');
    slot.append(done);
  }
  board.replaceChildren(targets, slot);
}

function restart() {
  matched = [];
  selected = false;
  feedback.textContent = 'Find the same one.';
  render();
}
// Touch release is reliable even when the browser omits a compatibility click after dragging.
function activate(button, action) {
  let start = null;
  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && event.isPrimary) start = { x: event.clientX, y: event.clientY };
  });
  button.addEventListener('pointercancel', () => { start = null; });
  button.addEventListener('pointerup', event => {
    if (event.pointerType !== 'touch' || !start) return;
    const tapped = Math.hypot(event.clientX - start.x, event.clientY - start.y) < 12;
    start = null;
    if (tapped && !button.disabled) action();
  });
  button.addEventListener('click', event => { if (event.pointerType !== 'touch') action(); });
}
document.querySelectorAll('[data-mode]').forEach(button => activate(button, () => {
  mode = button.dataset.mode;
  round = 0;
  document.querySelectorAll('[data-mode]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  document.querySelector('#matching-title').textContent = `Match the ${mode}`;
  restart();
}));
activate(next, () => { round = (round + 1) % (MATCHING_SETS[mode].length / 2); restart(); });
activate(document.querySelector('#matching-reset'), restart);
render();
