import { placeSelectedCounter, selectCounter } from '../../src/app/learning-session.js';

export const equalGroupsRenderer = {
  render({ session, target, onSessionChange }) {
    const layout = document.createElement('div');
    layout.className = 'workspace-layout';

    const counterBank = document.createElement('section');
    counterBank.className = 'counter-bank';
    counterBank.setAttribute('aria-label', 'Counter bank');
    counterBank.append(createHeading('Counter bank'), createHint('Tap a counter, then tap a group.'));

    const counterGrid = document.createElement('div');
    counterGrid.className = 'counter-grid';
    const placedCounterIds = new Set(
      session.workspaceSnapshot.state.groups.flatMap((group) => group.items),
    );
    counterGrid.append(
      ...session.workspaceSnapshot.state.counters
        .filter((counter) => !placedCounterIds.has(counter.id))
        .map((counter) => createCounterButton({ session, counterId: counter.id, onSessionChange })),
    );
    counterBank.append(counterGrid);

    const groupsArea = document.createElement('section');
    groupsArea.className = 'groups-area';
    groupsArea.setAttribute('aria-label', 'Equal groups');
    groupsArea.append(createHeading('Groups'));

    const groupsGrid = document.createElement('div');
    groupsGrid.className = 'groups-grid';
    groupsGrid.append(
      ...session.workspaceSnapshot.state.groups.map((group, index) =>
        createGroupCard({ session, group, index, onSessionChange }),
      ),
    );
    groupsArea.append(groupsGrid);

    layout.append(counterBank, groupsArea);
    target.append(layout);
  },
};

function createGroupCard({ session, group, index, onSessionChange }) {
  const groupCard = document.createElement('div');
  groupCard.className = 'group-card';
  groupCard.setAttribute('role', 'button');
  groupCard.setAttribute('tabindex', '0');
  groupCard.setAttribute('aria-label', `Place selected counter into group ${index + 1}`);

  const placeCounter = () => onSessionChange(placeSelectedCounter(session, group.id));
  groupCard.addEventListener('click', placeCounter);
  groupCard.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      placeCounter();
    }
  });

  const title = document.createElement('h4');
  title.textContent = `Group ${index + 1} (${group.items.length})`;

  const items = document.createElement('div');
  items.className = 'group-items';
  items.append(
    ...group.items.map((counterId) =>
      createCounterButton({ session, counterId, onSessionChange, placed: true }),
    ),
  );

  groupCard.append(title, items);
  if (session.tutorResponse.highlightTargets.includes(group.id)) {
    groupCard.classList.add('is-targeted');
  }
  return groupCard;
}

function createCounterButton({ session, counterId, onSessionChange, placed = false }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'counter';
  button.textContent = counterId.replace('counter_', '');
  button.setAttribute('aria-label', `Select ${counterId}`);
  if (placed) button.classList.add('is-placed');
  if (session.selectedCounterId === counterId) button.classList.add('is-selected');
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onSessionChange(selectCounter(session, counterId));
  });
  return button;
}

function createHeading(text) {
  const heading = document.createElement('h3');
  heading.textContent = text;
  return heading;
}

function createHint(text) {
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = text;
  return hint;
}
