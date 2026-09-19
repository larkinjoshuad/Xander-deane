import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ hasTouch: true });
for (const width of [390, 820, 1280]) {
  test(`play together touch games at ${width}`, async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app/play-together.html');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('One apple');
    await expect(page.locator('#sound')).not.toBeChecked();
    const drag = async (piece, drop, cancel = false) => {
      const source = await page.locator(`[data-piece="${piece}"]`).boundingBox();
      const destination = await page.locator(`[data-drop="${drop}"]`).boundingBox();
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
      await expect(page.locator('.is-moving')).toHaveCount(0);
    };
    await drag('apple-0', 'plate', true);
    await expect(page.locator('[data-piece]')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('picnic.png'), fullPage: true });
    for (let count = 1; count <= 3; count++) {
      for (let index = 0; index < count; index++) await drag(`apple-${index}`, 'plate');
      await expect(page.locator('.plate-items svg')).toHaveCount(count);
      await expect(page.locator('#offline-play')).toBeVisible();
      await expect(page.getByRole('status')).toContainText('Picnic time');
      await page.locator('#next').tap();
    }
    await expect(page.getByRole('heading', { level: 1 })).toContainText('One apple');
    await page.getByRole('button', { name: 'Hide & seek', exact: true }).tap();
    await drag('teddy-0', 'under');
    await expect(page.getByRole('status')).toContainText('another spot');
    await expect(page.locator('#next')).toBeDisabled();
    for (const position of ['inside', 'under', 'beside']) {
      await drag('teddy-0', position);
      await expect(page.locator(`[data-drop="${position}"]`)).toHaveClass(/filled/);
      await page.screenshot({ path: info.outputPath(`hide-${position}.png`), fullPage: true });
      await page.locator('#next').tap();
    }
    await page.getByRole('button', { name: 'Pack a bag', exact: true }).tap();
    await drag('ball-1', 'bag');
    await expect(page.getByRole('status')).toContainText('find the cup');
    await expect(page.locator('[data-piece]')).toHaveCount(2);
    await page.screenshot({ path: info.outputPath('pack.png'), fullPage: true });
    for (const piece of ['cup-0', 'ball-1', 'shoe-0']) {
      await page.locator(`[data-piece="${piece}"]`).tap();
      await page.getByRole('button', { name: 'Backpack', exact: true }).tap();
      await expect(page.locator('#offline-play')).toBeVisible();
      await page.locator('#next').tap();
    }
    await page.locator('#together').tap();
    await expect(page.locator('#offline-play')).toBeVisible();
    await page.locator('#again').tap();
    await expect(page.locator('#offline-play')).toBeHidden();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('keyboard, reduced motion and opt-in sound remain available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/play-together.html');
  await page.getByRole('button', { name: 'apple 1', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Picnic plate', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#next')).toBeFocused();
  expect(await page.locator('.play-finish').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.getByLabel('Activity menu', { exact: true }).click();
  await page.getByLabel('Sound & voice').check();
  await expect(page.getByLabel('Sound & voice')).toBeChecked();
  await page.getByLabel('Sound & voice').uncheck();
  await expect(page.getByLabel('Sound & voice')).not.toBeChecked();
});
