import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ hasTouch: true });
for (const width of [390, 820]) test(`Word Match plays both directions at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/app/library.html?subject=toddler&activity=word-match');
  await expect(page.locator('#activity')).toHaveValue('word-match');
  await page.getByRole('button', { name: 'ball', exact: true }).tap();
  await expect(page.getByRole('status')).toContainText('try again');
  for (const word of ['cup', 'ball', 'shoe', 'apple']) {
    await expect(page.getByRole('img')).toHaveAccessibleName(`Picture: ${word}`);
    await expect(page.getByRole('button', { name: word, exact: true })).toHaveText(word);
    if (word === 'cup') await page.screenshot({ path: info.outputPath('picture-to-word.png'), fullPage: true });
    await page.getByRole('button', { name: word, exact: true }).tap();
    await expect(page.getByRole('status')).toHaveText('You found it!');
    await page.getByRole('button', { name: 'Next problem' }).tap();
    await expect(page.locator('#library-prompt')).toHaveText(`Find the picture: ${word}`);
    const picture = page.getByRole('button', { name: word, exact: true });
    await expect(picture.locator('use')).toHaveAttribute('href', `./assets/play-world.svg#${word}`);
    if (word === 'cup') await page.screenshot({ path: info.outputPath('word-to-picture.png'), fullPage: true });
    await picture.tap();
    await expect(page.getByRole('status')).toHaveText('You found it!');
    if (word !== 'apple') await page.getByRole('button', { name: 'Next problem' }).tap();
  }
  await expect(page.locator('#round-position')).toHaveText('8 of 8');
  await page.getByRole('button', { name: 'Again', exact: true }).tap();
  await expect(page.getByRole('status')).toBeEmpty();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
