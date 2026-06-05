import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const seriousOrCritical = ['serious', 'critical'];

async function openShell(page) {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Interactive AI Tutor Shell' })).toBeVisible();
}

async function expectNoSeriousViolations(page) {
  const results = await new AxeBuilder({ page })
    .include('body')
    .analyze();
  const violations = results.violations.filter((violation) => seriousOrCritical.includes(violation.impact));

  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}


test('shell exposes named landmarks and live status regions for assistive technology', async ({ page }) => {
  await openShell(page);

  await expect(page.getByRole('main', { name: 'Interactive AI Tutor Shell' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Subject selector' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent saved sessions' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tutor communication area' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Interactive problem workspace' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Learner progress and activity' })).toBeVisible();
  await expect(page.locator('#device-status')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#guardian-preview-list')).toHaveAttribute('aria-live', 'polite');
});

test('initial shell has no serious automated accessibility violations', async ({ page }) => {
  await openShell(page);
  await expectNoSeriousViolations(page);
});

test('math workspace has no serious automated accessibility violations after interaction', async ({ page }) => {
  await openShell(page);
  await page.getByLabel('Select counter_1', { exact: true }).click();
  await page.getByLabel('Place selected counter into group 1', { exact: true }).click();
  await expectNoSeriousViolations(page);
});

test('language workspace has no serious automated accessibility violations', async ({ page }) => {
  await openShell(page);
  await page.getByRole('button', { name: 'Language: Action Verb' }).click();
  await expect(page.locator('#problem-prompt')).toContainText('Which word shows the action');
  await expectNoSeriousViolations(page);
});

test('science workspace has no serious automated accessibility violations', async ({ page }) => {
  await openShell(page);
  await page.getByRole('button', { name: 'Science: Sort Animals' }).click();
  await expect(page.locator('#problem-prompt')).toContainText('feathers');
  await expectNoSeriousViolations(page);
});
