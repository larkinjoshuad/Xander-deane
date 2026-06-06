import {
  placeSelectedSortItem,
  selectSortItem,
} from '../../src/app/learning-session.js';

export function classificationSortRenderer({ session, target, onSessionChange }) {
  const snapshot = session.workspaceSnapshot;
  const selectedItemId = snapshot.state.selectedItemId;
  const placedItemIds = new Set(snapshot.state.groups.flatMap((group) => group.items));
  const availableItems = snapshot.state.items.filter((item) => !placedItemIds.has(item.id));

  const workspace = document.createElement('div');
  workspace.className = 'sort-workspace';
  workspace.append(createItemBank({ availableItems, selectedItemId, session, onSessionChange }));
  workspace.append(createGroupGrid({ snapshot, selectedItemId, session, onSessionChange }));

  target.replaceChildren(workspace);
}

function createItemBank({ availableItems, selectedItemId, session, onSessionChange }) {
  const section = document.createElement('section');
  section.className = 'sort-bank';
  section.setAttribute('aria-label', 'Items to sort');

  const heading = document.createElement('h3');
  heading.textContent = 'Items to sort';
  section.append(heading);

  const row = document.createElement('div');
  row.className = 'sort-item-row';

  availableItems.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sort-item';
    button.classList.toggle('is-selected', selectedItemId === item.id);
    button.textContent = formatLabel(item.id);
    button.setAttribute('aria-pressed', String(selectedItemId === item.id));
    button.addEventListener('click', () => onSessionChange(selectSortItem(session, item.id)));
    row.append(button);
  });

  if (availableItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'All items have been placed. Check your answer or reset to try again.';
    row.append(empty);
  }

  section.append(row);
  return section;
}

function createGroupGrid({ snapshot, selectedItemId, session, onSessionChange }) {
  const grid = document.createElement('div');
  grid.className = 'sort-groups-grid';

  snapshot.state.groups.forEach((group) => {
    const card = document.createElement('article');
    card.className = 'group-card sort-group-card';
    card.classList.toggle('is-targeted', selectedItemId !== null);
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', formatLabel(group.id));

    const heading = document.createElement('h4');
    heading.textContent = formatLabel(group.id);
    card.append(heading);

    const placeButton = document.createElement('button');
    placeButton.type = 'button';
    placeButton.className = 'sort-place';
    placeButton.textContent = `Place selected item in ${formatLabel(group.id)}`;
    placeButton.setAttribute('aria-label', `Place selected item in ${formatLabel(group.id)}`);
    const placeItem = () => onSessionChange(placeSelectedSortItem(session, group.id));
    placeButton.addEventListener('click', placeItem);
    placeButton.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        placeItem();
      }
    });
    card.append(placeButton);

    const list = document.createElement('div');
    list.className = 'sort-group-items';
    group.items.forEach((itemId) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'sort-item is-placed';
      item.classList.toggle('is-selected', selectedItemId === itemId);
      item.textContent = formatLabel(itemId);
      item.setAttribute('aria-pressed', String(selectedItemId === itemId));
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        onSessionChange(selectSortItem(session, itemId));
      });
      list.append(item);
    });

    if (group.items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = selectedItemId ? 'Use the button above to place the selected item.' : 'Select an item first.';
      list.append(empty);
    }

    card.append(list);
    grid.append(card);
  });

  return grid;
}

function formatLabel(value) {
  return value
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}
