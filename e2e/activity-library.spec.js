import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACTIVITY_LIBRARY } from '../src/app/activity-library.js';

test.use({ hasTouch: true });
test('every activity opens, accepts an answer and reaches its last problem', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const activity of ACTIVITY_LIBRARY) {
    await page.goto(`/app/library.html?activity=${activity.id}`);
    await expect(page.locator('#activity')).toHaveValue(activity.id);
    const round = activity.rounds[0];
    if (activity.kind === 'memory') {
      for (const choice of round.choices) {
        await page.locator(`[data-choice="${choice.id}"]`).nth(0).tap();
        await page.locator(`[data-choice="${choice.id}"]`).nth(1).tap();
      }
      await expect(page.getByRole('status')).toContainText('All the pairs');
    } else {
      for (const id of round.answer) await page.getByRole('button', { name: round.choices.find(item => item.id === id).text, exact: true }).tap();
      if (activity.kind === 'order') await page.getByRole('button', { name: 'Check', exact: true }).tap();
      await expect(page.getByRole('status')).toContainText(activity.kind === 'order' ? 'That order works' : 'You found it');
    }
    for (let index = 1; index < activity.rounds.length; index++) await page.getByRole('button', { name: 'Next problem' }).tap();
    await expect(page.locator('#round-position')).toHaveText(`${activity.rounds.length} of ${activity.rounds.length}`);
    await expect(page.getByRole('button', { name: 'Next problem' })).toBeDisabled();
  }
  expect(errors).toEqual([]);
});

for (const width of [390, 820, 1280]) test(`library interaction and layout at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/app/library.html?activity=color-patterns');
  await expect(page.getByRole('img')).toHaveAccessibleName(/red, blue, red/);
  await page.getByRole('button', { name: 'red', exact: true }).tap();
  await expect(page.getByRole('status')).toContainText('try again');
  await page.getByRole('button', { name: 'blue', exact: true }).tap();
  await expect(page.getByRole('status')).toContainText('You found it');
  await page.screenshot({ path: info.outputPath('patterns.png'), fullPage: true });
  await page.locator('#activity').selectOption('size-order');
  await page.getByRole('button', { name: 'large circle', exact: true }).tap();
  await page.getByRole('button', { name: 'medium circle', exact: true }).tap();
  await page.getByRole('button', { name: 'small circle', exact: true }).tap();
  await page.getByRole('button', { name: 'Check', exact: true }).tap();
  await expect(page.getByRole('status')).toContainText('change the order');
  await page.getByRole('button', { name: 'Undo', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Again', exact: true }).tap();
  await page.locator('#activity').selectOption('picture-memory');
  await page.locator('[data-choice="apple"]').nth(0).tap();
  await page.locator('[data-choice="cup"]').nth(0).tap();
  await expect(page.getByRole('status')).toContainText('different pictures');
  await page.locator('[data-choice="apple"]').nth(1).tap();
  await page.locator('[data-choice="apple"]').nth(0).tap();
  await expect(page.getByRole('status')).toHaveText('A pair!');
  await page.locator('[data-choice="cup"]').nth(0).tap();
  await page.locator('[data-choice="cup"]').nth(1).tap();
  await expect(page.getByRole('status')).toContainText('All the pairs');
  await page.screenshot({ path: info.outputPath('memory.png'), fullPage: true });
  await page.getByRole('button', { name: 'Science', exact: true }).tap();
  await expect(page.locator('#coverage')).toContainText('39 problems');
  await page.locator('#activity').selectOption('life-sequences');
  await expect(page.locator('#check')).toBeDisabled();
  await page.getByRole('button', { name: 'Next problem' }).tap();
  await page.screenshot({ path: info.outputPath('science.png'), fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('keyboard and invalid links have safe defaults', async ({ page }) => {
  await page.goto('/app/library.html?subject=invalid&activity=unknown');
  await expect(page.locator('#activity')).toHaveValue('add');
  await page.getByRole('button', { name: '2', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('You found it!');
  await page.reload();
  await expect(page.locator('#activity')).toHaveValue('add');
  await expect(page.getByRole('status')).toBeEmpty();
});
