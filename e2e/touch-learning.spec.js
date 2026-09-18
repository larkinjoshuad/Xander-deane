import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ hasTouch: true });

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1280, height: 900 }]) {
  test(`touch practice completes and recovers at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/app/index.html');
    await expect(page).toHaveURL(/learn.html$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Build 3 groups');
    await expect(page.getByRole('link', { name: 'Family overview' })).not.toBeVisible();
    await expect(page.locator('#progress-dashboard')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const counters = await page.locator('.counter-grid .counter').evaluateAll((items) => items.map((item) => {
      const { x, y, width, height } = item.getBoundingClientRect();
      return { x, y, width, height };
    }));
    expect(counters[0].width).toBe(counters[0].height);
    expect(counters[1].x).toBeGreaterThan(counters[0].x + counters[0].width);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`touch-${viewport.width}.png`), fullPage: true });
    for (let i = 1; i <= 12; i++) {
      const counter = page.getByLabel(`Select counter_${i}`, { exact: true });
      const box = await counter.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await counter.tap();
      await expect(counter).toHaveAttribute('aria-pressed', 'true');
      await page.getByLabel(`Place selected counter into group ${Math.ceil(i / 4)}`, { exact: true }).tap({ position: { x: 8, y: 45 } });
    }
    await page.getByRole('button', { name: 'Check answer' }).tap();
    await expect(page.locator('#tutor-message')).toContainText('Great work');
    await page.reload();
    await expect(page.getByText('Group 1 (4)', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reset', exact: true }).tap();
    await expect(page.getByText('Group 1 (0)', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Hint', exact: true }).tap();
    await expect(page.locator('#tutor-message')).not.toBeEmpty();
    await page.getByLabel('Activity menu', { exact: true }).tap();
    await page.getByRole('button', { name: 'Language', exact: true }).tap();
    await expect(page.locator('#problem-prompt')).toContainText('Tap the action verb');
    await page.getByLabel('Select token runs', { exact: true }).tap();
    await page.getByRole('button', { name: 'Check answer' }).tap();
    await expect(page.locator('#tutor-message')).toContainText('action verb');
    await page.getByLabel('Activity menu', { exact: true }).tap();
    await page.getByRole('button', { name: 'Science', exact: true }).tap();
    await expect(page.locator('.sort-workspace')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
