import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACTIVITY_LIBRARY } from '../src/app/activity-library.js';

test('color play keeps focus, celebrates success, and advances without skipping', async ({ page }, info) => {
  await page.goto('/app/library.html?activity=color-hunt');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('800 24px Nunito'))).toBe(true);
  await expect(page.locator('#continue')).toBeHidden();
  await page.screenshot({ path: info.outputPath('color-hunt.png'), fullPage: true });
  await page.getByRole('button', { name: 'blue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'blue', exact: true })).toBeFocused();
  await expect(page.locator('#library-feedback')).toContainText('try again');
  await page.getByRole('button', { name: 'red', exact: true }).click();
  await expect(page.locator('#continue')).toBeFocused();
  await expect(page.locator('#library-feedback')).toHaveClass('is-complete');
  await page.locator('#continue').click();
  await expect(page.locator('#library-prompt')).toHaveText('Find blue.');
  await expect(page.locator('#library-prompt')).toBeFocused();
  await expect(page.locator('#round-progress')).toHaveAttribute('value', '2');
  await expect(page.locator('#continue')).toBeHidden();
  for (const color of ['blue', 'yellow', 'green', 'pink', 'orange']) {
    await page.getByRole('button', { name: color, exact: true }).click();
    if (color !== 'orange') await page.locator('#continue').click();
  }
  await expect(page.locator('#next')).toBeDisabled();
  await expect(page.locator('#continue')).toBeHidden();
  await expect(page.locator('#again')).toBeFocused();
  await page.locator('#again').click();
  await expect(page.locator('#library-feedback')).toBeEmpty();
  await expect(page.locator('.library-choice:enabled')).toHaveCount(3);
});

test('all activity layouts fit and the main variants remain accessible', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const activity of ACTIVITY_LIBRARY) {
    await page.goto(`/app/library.html?activity=${activity.id}`);
    await expect(page.locator('#library-prompt')).toHaveText(activity.rounds[0].prompt);
    const geometry = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const choices = [...document.querySelectorAll('.library-choice')];
      return {
        overflow: document.documentElement.scrollWidth > width,
        badChoices: choices.filter(button => {
          const rect = button.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44 || rect.left < 0 || rect.right > width || button.scrollWidth > button.clientWidth + 1;
        }).length,
      };
    });
    expect(geometry, activity.id).toEqual({ overflow: false, badChoices: 0 });
    if (['color-hunt', 'size-order', 'picture-memory', 'rhymes', 'habitats'].includes(activity.id)) {
      const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(a11y.violations, activity.id).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${activity.id}.png`), fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

test('ordering, memory, menus and visible audio controls remain usable', async ({ page }) => {
  await page.goto('/app/library.html?activity=number-order');
  for (const name of ['1', '2', '3']) await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('#check')).toBeFocused();
  await page.locator('#check').click();
  await expect(page.locator('#continue')).toBeFocused();
  await page.locator('#again').click();
  await expect(page.locator('#check')).toBeDisabled();
  await expect(page.locator('.library-choice:enabled')).toHaveCount(3);

  await page.goto('/app/library.html?activity=picture-memory');
  const pairs = await page.locator('[data-card]').evaluateAll(buttons => buttons.map(button => ({ card: button.dataset.card, choice: button.dataset.choice })));
  for (const choice of new Set(pairs.map(pair => pair.choice))) {
    for (const pair of pairs.filter(pair => pair.choice === choice)) await page.locator(`[data-card="${pair.card}"]`).click();
  }
  await expect(page.locator('#library-feedback')).toHaveText('All the pairs! Nicely found.');
  await expect(page.locator('#continue')).toBeFocused();

  await page.goto('/app/library.html?activity=rhymes');
  await page.getByRole('button', { name: 'Read question aloud', exact: true }).click();
  await expect(page.locator('#listen')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#listen').click();
  await expect(page.locator('#listen')).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Activity menu', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.activity-menu')).not.toHaveAttribute('open', '');
  await expect(page.locator('summary')).toBeFocused();
  await page.locator('summary').click();
  await page.locator('.play-space').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('.activity-menu')).not.toHaveAttribute('open', '');
  await page.locator('#next').click();
  await expect(page.locator('#round-position')).toHaveText('2 of 8');
});

test('small screens and reduced motion retain usable play controls', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/library.html?activity=life-sequences');
  await page.locator('#next').click();
  for (const name of ['egg', 'caterpillar', 'chrysalis', 'butterfly']) await page.getByRole('button', { name, exact: true }).click();
  await page.locator('#check').click();
  await expect(page.locator('#continue')).toBeVisible();
  expect(await page.locator('.correct').first().evaluate(button => getComputedStyle(button).animationName)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('small-screen-order.png'), fullPage: true });
});
