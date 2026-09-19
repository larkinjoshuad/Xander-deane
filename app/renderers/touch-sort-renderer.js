import { placeSelectedSortItem, selectSortItem } from '../../src/app/learning-session.js';

const pictures = Object.freeze({ duck: '\u{1F986}', dog: '\u{1F415}', eagle: '\u{1F985}', snake: '\u{1F40D}' });

export function touchSortRenderer({ session, target, onSessionChange }) {
  const state = session.workspaceSnapshot.state;
  const workspace = document.createElement('div');
  workspace.className = 'sort-workspace visual-sort';
  const placed = new Set(state.groups.flatMap((group) => group.items));
  const remaining = state.items.filter((item) => !placed.has(item.id));
  const move = (itemId, groupId) => onSessionChange(placeSelectedSortItem(selectSortItem(session, itemId), groupId));

  function tile(id) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'animal-tile';
    button.dataset.itemId = id;
    button.setAttribute('aria-label', label(id));
    button.setAttribute('aria-pressed', String(state.selectedItemId === id));
    const picture = document.createElement('span');
    picture.className = 'animal-picture';
    picture.textContent = pictures[id] ?? '\u25C7';
    picture.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('span');
    caption.textContent = label(id);
    button.append(picture, caption);
    let gesture = null;
    let suppressClick = false;
    let ghost = null;
    let hovered = null;
    const cleanup = () => {
      ghost?.remove();
      hovered?.classList.remove('is-drop-target');
      button.classList.remove('is-dragging');
      ghost = hovered = gesture = null;
    };
    button.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      onSessionChange(selectSortItem(session, id));
    });
    button.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      suppressClick = false;
      gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (!ghost && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 8) return;
      if (!ghost) {
        ghost = button.cloneNode(true);
        ghost.className = 'animal-tile drag-preview';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.tabIndex = -1;
        document.body.append(ghost);
        button.classList.add('is-dragging');
      }
      event.preventDefault();
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
      hovered?.classList.remove('is-drop-target');
      hovered = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop-group]');
      if (!workspace.contains(hovered)) hovered = null;
      hovered?.classList.add('is-drop-target');
    });
    button.addEventListener('pointerup', (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dragged = Boolean(ghost);
      const releasedZone = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop-group]');
      const groupId = workspace.contains(releasedZone) ? releasedZone?.dataset.dropGroup : null;
      suppressClick = dragged;
      cleanup();
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      if (dragged && groupId) move(id, groupId);
      else if (!dragged && event.pointerType === 'touch') {
        suppressClick = true;
        onSessionChange(selectSortItem(session, id));
      }
    });
    button.addEventListener('pointercancel', () => { suppressClick = true; cleanup(); });
    button.addEventListener('lostpointercapture', cleanup);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { suppressClick = true; cleanup(); }
    });
    return button;
  }

  if (remaining.length) {
    const bank = document.createElement('section');
    bank.className = 'animal-bank';
    bank.setAttribute('aria-label', 'Animals to sort');
    bank.append(...remaining.map((item) => tile(item.id)));
    workspace.append(bank);
  }
  const groups = document.createElement('div');
  groups.className = 'animal-groups';
  state.groups.forEach((group) => {
    const zone = document.createElement('section');
    zone.className = 'animal-zone';
    zone.dataset.dropGroup = group.id;
    zone.setAttribute('aria-label', label(group.id));
    const heading = document.createElement('h2');
    heading.textContent = label(group.id);
    const destination = document.createElement('button');
    destination.type = 'button';
    destination.className = 'animal-destination';
    destination.setAttribute('aria-label', `Place selected animal in ${label(group.id)}`);
    destination.addEventListener('click', () => {
      if (state.selectedItemId) move(state.selectedItemId, group.id);
    });
    const items = document.createElement('div');
    items.className = 'animal-zone-items';
    items.append(...group.items.map(tile));
    zone.append(destination, heading, items);
    groups.append(zone);
  });
  workspace.append(groups);
  target.replaceChildren(workspace);
}

function label(id) {
  return id.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}
