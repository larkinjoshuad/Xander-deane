import { expect, test } from '@playwright/test';

async function openShell(page) {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Interactive AI Tutor Shell' })).toBeVisible();
  await expect(page.locator('#device-status')).toContainText(/targets/);
  await expect(page.locator('#guardian-preview-heading')).toContainText('What adults should know');
  await expect(page.locator('#guardian-preview-list')).toContainText('guardian consent required');
}

test('learner can complete the math equal-groups flow and recover persisted state', async ({ page }, testInfo) => {
  await openShell(page);
  await expect(page.locator('#problem-prompt')).toContainText('Build 3 groups of 4 counters');
  await expect(page.locator('#progress-objective')).toContainText('Understand multiplication as equal groups');
  await expect(page.locator('#progress-attempts')).toContainText('0 checked');
  await expect(page.locator('#recent-session-count')).toContainText('1 saved');
  await expect(page.locator('#recent-session-list')).toContainText('Math: Equal Groups');

  for (let counter = 1; counter <= 12; counter += 1) {
    const groupNumber = Math.ceil(counter / 4);
    await page.getByLabel(`Select counter_${counter}`, { exact: true }).click();
    await page.getByLabel(`Place selected counter into group ${groupNumber}`, { exact: true }).click();
  }

  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.locator('#feedback-type')).toContainText('Summary');
  await expect(page.locator('#tutor-message')).toContainText('Great work');
  await expect(page.locator('#progress-attempts')).toContainText('1 checked · 1 correct');
  await expect(page.locator('#progress-accuracy')).toContainText('100%');
  await expect(page.locator('#progress-next-step')).toContainText('Great work');
  await expect(page.locator('#guardian-preview-status')).toContainText('Progress captured');
  await expect(page.locator('#guardian-preview-list')).toContainText('100% accuracy');
  await expect(page.locator('#event-log')).toContainText('Checked answer and got it right.');
  if (!testInfo.project.name.includes('glasses')) {
    await expect(page.locator('#event-count')).toContainText(/events .* snapshots saved/);
    await expect(page.locator('#event-log')).toBeVisible();
  }

  await page.reload();
  await expect(page.locator('#feedback-type')).toContainText('Summary');
  await expect(page.locator('#progress-attempts')).toContainText('1 checked · 1 correct');
  if (!testInfo.project.name.includes('glasses')) {
    await expect(page.locator('#event-count')).toContainText(/events .* snapshots saved/);
  }
  await expect(page.getByText('Group 1 (4)')).toBeVisible();
});

test('learner gets retry feedback, resets, and recovers the cleared math workspace', async ({ page }, testInfo) => {
  await openShell(page);

  await page.getByLabel('Select counter_1', { exact: true }).click();
  await page.getByLabel('Place selected counter into group 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();

  await expect(page.locator('#feedback-type')).toContainText('Hint');
  await expect(page.locator('#tutor-message')).toContainText('Each group needs exactly 4 counters');
  await expect(page.locator('#progress-attempts')).toContainText('1 checked · 0 correct');
  await expect(page.locator('#progress-next-step')).toContainText('Keep practicing');
  await expect(page.locator('#event-log')).toContainText('Checked answer and received a hint.');
  if (!testInfo.project.name.includes('glasses')) {
    await expect(page.locator('#event-count')).toContainText(/events .* snapshots saved/);
  }

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('#feedback-type')).toContainText('Encouragement');
  await expect(page.locator('#tutor-message')).toContainText('Workspace reset. Try the problem again.');
  await expect(page.getByText('Group 1 (0)')).toBeVisible();
  await expect(page.getByLabel('Select counter_1', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator('#tutor-message')).toContainText('Workspace reset. Try the problem again.');
  await expect(page.getByText('Group 1 (0)')).toBeVisible();
  await expect(page.getByLabel('Select counter_1', { exact: true })).toBeVisible();
});

test('learner can switch to language and complete token selection', async ({ page }) => {
  await openShell(page);
  await page.getByRole('button', { name: 'Language: Action Verb' }).click();
  await expect(page.locator('#problem-prompt')).toContainText('Which word shows the action');

  await page.getByRole('button', { name: 'runs' }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();

  await expect(page.locator('#feedback-type')).toContainText('Summary');
  await expect(page.locator('#tutor-message')).toContainText('shows the action');
  await expect(page.locator('#progress-attempts')).toContainText('1 checked · 1 correct');
  await expect(page.locator('#recent-session-count')).toContainText('2 saved');
  await expect(page.locator('#recent-session-list')).toContainText('Language: Token Selection');
});

test('learner can switch to science and complete classification sort', async ({ page }) => {
  await openShell(page);
  await page.getByRole('button', { name: 'Science: Sort Animals' }).click();
  await expect(page.locator('#problem-prompt')).toContainText('feathers');

  await page.getByRole('button', { name: 'Duck' }).click();
  await page.getByLabel('Place selected item in Feathers').click();
  await page.getByRole('button', { name: 'Eagle' }).click();
  await page.getByLabel('Place selected item in Feathers').click();
  await page.getByRole('button', { name: 'Check answer' }).click();

  await expect(page.locator('#feedback-type')).toContainText('Summary');
  await expect(page.locator('#tutor-message')).toContainText('feathers');
  await expect(page.locator('#progress-attempts')).toContainText('1 checked · 1 correct');
});

test('learner can resume and clear recent saved sessions intentionally', async ({ page }) => {
  await openShell(page);
  await page.getByLabel('Select counter_1', { exact: true }).click();
  await page.getByLabel('Place selected counter into group 1', { exact: true }).click();
  await expect(page.getByText('Group 1 (1)')).toBeVisible();

  await page.getByRole('button', { name: 'Language: Action Verb' }).click();
  await expect(page.locator('#recent-session-count')).toContainText('2 saved');

  await page.getByLabel('Resume Math session').click();
  await expect(page.locator('#problem-prompt')).toContainText('Build 3 groups of 4 counters');
  await expect(page.getByText('Group 1 (1)')).toBeVisible();

  await page.getByLabel('Clear Math session').click();
  await expect(page.getByText('Group 1 (0)')).toBeVisible();
  await expect(page.locator('#recent-session-count')).toContainText('2 saved');
});

test('workspace placement targets support keyboard activation', async ({ page }) => {
  await openShell(page);

  await page.getByLabel('Select counter_1', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Place selected counter into group 1', { exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByText('Group 1 (1)')).toBeVisible();

  await page.getByRole('button', { name: 'Science: Sort Animals' }).click();
  await page.getByRole('button', { name: 'Duck' }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Place selected item in Feathers').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Duck' })).toHaveClass(/is-placed/);
});

test('responsive shell exposes expected device profile hooks', async ({ page }, testInfo) => {
  await openShell(page);
  const body = page.locator('body');
  const deviceProfile = await body.getAttribute('data-device-profile');
  const presentationMode = await body.getAttribute('data-presentation-mode');

  expect(deviceProfile).toMatch(/computer|tablet|phone|glasses/);
  expect(presentationMode).toMatch(/full|compact|glance/);
  await expect(page.locator('#device-status')).toContainText(/targets/);

  if (testInfo.project.name.includes('glasses')) {
    await expect(body).toHaveAttribute('data-device-profile', 'glasses');
    await expect(body).toHaveAttribute('data-presentation-mode', 'glance');
  }
});

test('critical shell controls are keyboard reachable', async ({ page }) => {
  await openShell(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Math: Equal Groups' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Language: Action Verb' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#problem-prompt')).toContainText('Which word shows the action');
});
