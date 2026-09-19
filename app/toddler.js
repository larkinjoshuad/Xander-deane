import { MATCHING_SETS, matchingRound, isMatchingDrop } from '../src/app/toddler-matching.js';

const board = document.querySelector('#matching-board');
const feedback = document.querySelector('#matching-feedback');
const next = document.querySelector('#matching-next');
let mode = 'letters', round = 0, matched = [], selected = false;
let cancelGesture = () => {};

function place(destination) {
  const symbols = matchingRound(mode, round);
  const symbol = symbols.find(value => !matched.includes(value));
  if (!isMatchingDrop(symbols, symbol, destination)) {
    feedback.textContent = 'Try the same shape.';
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
    target.textContent = symbol;
    target.dataset.match = symbol;
    target.setAttribute('aria-label', `${symbol} target${matched.includes(symbol) ? ', matched' : ''}`);
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
    piece.textContent = symbol;
    piece.setAttribute('aria-label', `Match ${symbol}`);
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
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  round = 0;
  document.querySelectorAll('[data-mode]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  document.querySelector('#matching-title').textContent = `Match the ${mode}`;
  restart();
}));
next.addEventListener('click', () => { round = (round + 1) % (MATCHING_SETS[mode].length / 2); restart(); });
document.querySelector('#matching-reset').addEventListener('click', restart);
render();
