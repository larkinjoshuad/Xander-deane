import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ hasTouch: true });
for (const width of [390, 820]) {
  test(`animal sorting supports drag, correction and recovery at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/app/learn.html?subject=science');
    await expect(page.locator('.animal-tile')).toHaveCount(4);
    await page.screenshot({ path: testInfo.outputPath('animals-start.png'), fullPage: true });
    const drag = async (name, group) => {
      const source = await page.getByRole('button', { name, exact: true }).boundingBox();
      const zone = await page.locator(`[data-drop-group="${group}"]`).boundingBox();
      const client = await page.context().newCDPSession(page);
      const x = source.x + source.width / 2, y = source.y + source.height / 2;
      const endX = zone.x + 10, endY = zone.y + 55;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 8; i++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (endX - x) * i / 8, y: y + (endY - y) * i / 8 }] });
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await client.detach();
      await expect(page.locator(`[data-drop-group="${group}"]`).getByRole('button', { name, exact: true })).toBeVisible();
      await expect(page.locator('.drag-preview')).toHaveCount(0);
    };
    await drag('Duck', 'feathers');
    await drag('Snake', 'feathers');
    await drag('Eagle', 'not_feathers');
    await page.getByRole('button', { name: 'Dog', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Dog', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Place selected animal in Not Feathers', { exact: true }).tap({ position: { x: 8, y: 55 } });
    await expect(page.locator('.animal-bank')).toHaveCount(0);
    await page.getByRole('button', { name: 'Check answer' }).tap();
    await expect(page.locator('#tutor-message')).toContainText('Which ones have feathers');
    await expect(page.locator('#tutor-message')).not.toContainText(/snake|eagle/i);
    await page.reload();
    await expect(page.locator('#tutor-message')).toContainText('Which ones have feathers');
    await drag('Eagle', 'feathers');
    await drag('Snake', 'not_feathers');
    await page.getByRole('button', { name: 'Check answer' }).tap();
    await expect(page.locator('#tutor-message')).toContainText('Yes!');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('animals-sorted.png'), fullPage: true });
    await page.getByRole('button', { name: 'Reset', exact: true }).tap();
    await expect(page.locator('.animal-bank .animal-tile')).toHaveCount(4);
  });
}

test('keyboard placement and cancelled drag do not lose an animal', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app/learn.html?subject=science');
  const duck = page.getByRole('button', { name: 'Duck', exact: true });
  await duck.focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Place selected animal in Feathers', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-drop-group="feathers"] .animal-tile')).toHaveCount(1);
  const snake = page.getByRole('button', { name: 'Snake', exact: true });
  const box = await snake.boundingBox();
  await page.mouse.move(box.x + 25, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(10, 90, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.animal-bank').getByRole('button', { name: 'Snake', exact: true })).toBeVisible();
  await expect(page.locator('.drag-preview')).toHaveCount(0);
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 25, y: box.y + 25 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 60, y: box.y + 60 }] });
  await expect(page.locator('.drag-preview')).toHaveCount(1);
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await client.detach();
  await expect(page.locator('.drag-preview')).toHaveCount(0);
  await expect(page.locator('.animal-tile')).toHaveCount(4);
  expect(errors).toEqual([]);
});
