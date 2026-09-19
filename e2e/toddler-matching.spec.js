import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ hasTouch: true });
for (const width of [390, 820]) {
  test(`toddler matching touch flow at ${width}`, async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/app/toddler.html');
    const drag = async (symbol, target, cancel = false) => {
      const source = await page.getByRole('button', { name: `Match ${symbol.replace('_', ' ')}`, exact: true }).boundingBox();
      const destination = await page.locator(`[data-match="${target}"]`).boundingBox();
      const client = await page.context().newCDPSession(page);
      const x = source.x + source.width / 2, y = source.y + source.height / 2;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
          x: x + (destination.x + destination.width / 2 - x) * step / 8,
          y: y + (destination.y + destination.height / 2 - y) * step / 8,
        }] });
      }
      await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      await client.detach();
    };
    await drag('A', 'A', true);
    await expect(page.getByRole('button', { name: 'Match A', exact: true })).toBeVisible();
    await expect(page.locator('.is-moving')).toHaveCount(0);
    await drag('A', 'B');
    await expect(page.getByRole('status')).toContainText('Try the same shape');
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await drag('A', 'A');
    await expect(page.getByRole('button', { name: 'Match B', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Match B', exact: true }).tap();
    await page.getByRole('button', { name: 'B target', exact: true }).tap();
    await expect(page.getByRole('status')).toHaveText('You matched them!');
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Match C', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Numbers', exact: true }).tap();
    await drag('1', '1');
    await drag('2', '2');
    await page.getByRole('button', { name: 'Again', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Match 1', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Shapes', exact: true }).tap();
    await drag('circle', 'square');
    await expect(page.getByRole('status')).toContainText('Try the same shape');
    await drag('circle', 'circle');
    await drag('square', 'square');
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
    await drag('triangle', 'triangle');
    await drag('oval', 'oval');
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
    await drag('star', 'star');
    await drag('heart', 'heart');
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Match circle', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('shapes.png'), fullPage: true });
    await page.getByRole('button', { name: 'Sizes', exact: true }).tap();
    const big = await page.locator('[data-match="big_circle"] .matching-shape').boundingBox();
    const small = await page.locator('[data-match="small_circle"] .matching-shape').boundingBox();
    expect(big.width).toBeGreaterThan(small.width * 2);
    await drag('big_circle', 'small_circle');
    await expect(page.getByRole('status')).toContainText('Try the same size');
    await drag('big_circle', 'big_circle', true);
    await expect(page.locator('.is-moving')).toHaveCount(0);
    await drag('big_circle', 'big_circle');
    await drag('small_circle', 'small_circle');
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
    await drag('small_square', 'small_square');
    await drag('big_square', 'big_square');
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
    await drag('big_triangle', 'big_triangle');
    await drag('small_triangle', 'small_triangle');
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Match big circle', exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('toddler.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('keyboard can complete every number round and wrap back to one', async ({ page }) => {
  await page.goto('/app/toddler.html');
  await page.getByRole('button', { name: 'Numbers', exact: true }).click();
  for (let number = 1; number <= 10; number++) {
    await page.getByRole('button', { name: `Match ${number}`, exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: `${number} target`, exact: true }).focus();
    await page.keyboard.press('Enter');
    if (number % 2 === 0) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'Match 1', exact: true })).toBeVisible();
});
