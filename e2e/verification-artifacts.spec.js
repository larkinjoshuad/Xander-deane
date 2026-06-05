import { expect, test } from '@playwright/test';

async function openShell(page) {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Interactive AI Tutor Shell' })).toBeVisible();
  await expect(page.locator('#device-status')).toContainText(/targets/);
}

async function captureVerificationScreenshot(page, testInfo, name) {
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`verification-${testInfo.project.name}-${name}.png`),
  });
}

test('captures browser verification screenshots for review artifacts', async ({ page }, testInfo) => {
  await openShell(page);
  await captureVerificationScreenshot(page, testInfo, 'initial-shell');

  for (let counter = 1; counter <= 12; counter += 1) {
    const groupNumber = Math.ceil(counter / 4);
    await page.getByLabel(`Select counter_${counter}`, { exact: true }).click();
    await page.getByLabel(`Place selected counter into group ${groupNumber}`, { exact: true }).click();
  }

  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.locator('#feedback-type')).toContainText('Summary');
  await expect(page.locator('#guardian-preview-list')).toContainText('100% accuracy');
  await captureVerificationScreenshot(page, testInfo, 'completed-math-guardian-preview');
});
