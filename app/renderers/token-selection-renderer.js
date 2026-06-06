import { selectToken } from '../../src/app/learning-session.js';

export const tokenSelectionRenderer = {
  render({ session, target, onSessionChange }) {
    const panel = document.createElement('section');
    panel.className = 'token-workspace';
    panel.setAttribute('aria-label', 'Token selection workspace');

    const heading = document.createElement('h3');
    heading.textContent = 'Sentence';

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Tap the word that shows the action.';

    const tokenRow = document.createElement('div');
    tokenRow.className = 'token-row';
    tokenRow.append(
      ...session.workspaceSnapshot.state.tokens.map((token, index) =>
        createTokenButton({ session, token, index, onSessionChange }),
      ),
    );

    panel.append(heading, hint, tokenRow);
    target.append(panel);
  },
};

function createTokenButton({ session, token, index, onSessionChange }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'token-button';
  button.textContent = token;
  button.setAttribute('aria-label', `Select token ${token}`);
  if (session.workspaceSnapshot.state.selectedTokenIndex === index) {
    button.classList.add('is-selected');
  }
  if (session.tutorResponse.highlightTargets.includes(`token_${index}`)) {
    button.classList.add('is-targeted');
  }
  button.addEventListener('click', () => onSessionChange(selectToken(session, index)));
  return button;
}
