import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('family overview starts the selected activity and shows returned progress', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/app/parent.html');
  await expect(page.getByRole('heading', { name: 'Family learning' })).toBeVisible();
  await expect(page.locator('#overview-accuracy')).toHaveText('No checks yet');
  await expect(page.locator('#focus-lesson-link')).toHaveText('Practice Math');
  await expect(page.locator('.subject-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('family-overview.png'), fullPage: true });
  await page.getByRole('link', { name: 'Practice Language', exact: true }).click();
  await expect(page.locator('#problem-prompt')).toContainText('Tap the action verb');
  await page.getByRole('button', { name: 'Select token runs', exact: true }).click();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.locator('#tutor-message')).toContainText('action verb');
  await page.getByRole('link', { name: 'Family overview', exact: true }).click();
  await expect(page.locator('#overview-attempts')).toHaveText('1');
  await expect(page.locator('#overview-accuracy')).toHaveText('100%');
  await expect(page.locator('#dashboard-headline')).not.toContainText('Ready to advance');
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Language', exact: true }) })).toContainText('different example');
  await page.reload();
  await expect(page.locator('#overview-attempts')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('unknown lesson subject falls back to math', async ({ page }) => {
  await page.goto('/app/learn.html?subject=unknown');
  await expect(page.locator('#problem-prompt')).toContainText('Build 3 groups of 4');
});
