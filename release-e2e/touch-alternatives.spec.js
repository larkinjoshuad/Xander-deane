import { test, expect } from '@playwright/test';

test.use({ hasTouch: true });

test('touch choices and sequences recover from mistakes without requiring pointer focus', async ({ page }) => {
  await page.goto('/app/library.html?activity=color-hunt');
  await page.getByRole('button', { name: 'blue', exact: true }).tap();
  await expect(page.locator('#library-feedback')).toContainText('try again');
  await page.getByRole('button', { name: 'red', exact: true }).tap();
  await expect(page.locator('#library-feedback')).toHaveText('You found it!');
  await page.locator('#continue').tap();
  await expect(page.locator('#library-prompt')).toHaveText('Find blue.');
  await page.goto('/app/library.html?activity=number-order');
  for (const name of ['1', '2', '3']) await page.getByRole('button', { name, exact: true }).tap();
  await page.locator('#check').tap();
  await expect(page.locator('#library-feedback')).toHaveText('That order works!');
  await page.locator('#again').tap();
  await expect(page.locator('.library-choice:enabled')).toHaveCount(3);
});

test('matching and co-play support tap-to-place as an alternative to dragging', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app/toddler.html');
  await page.getByRole('button', { name: 'Match A', exact: true }).tap();
  await page.getByRole('button', { name: 'B target', exact: true }).tap();
  await expect(page.getByRole('status')).toContainText('Try the same shape');
  for (const letter of ['A', 'B']) {
    await page.getByRole('button', { name: `Match ${letter}`, exact: true }).tap();
    await page.getByRole('button', { name: `${letter} target`, exact: true }).tap();
  }
  await expect(page.getByRole('status')).toHaveText('You matched them!');
  await page.getByRole('button', { name: 'Next', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Match C', exact: true })).toBeVisible();
  await page.goto('/app/play-together.html');
  await page.getByRole('button', { name: 'apple 1', exact: true }).tap();
  await page.getByRole('button', { name: 'Picnic plate', exact: true }).tap();
  await expect(page.locator('#offline-play')).toBeVisible();
  await page.locator('#next').tap();
  await expect(page.locator('[data-piece]')).toHaveCount(2);
  expect(errors).toEqual([]);
});
