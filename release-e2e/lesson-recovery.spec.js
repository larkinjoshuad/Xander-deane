import { test, expect } from '@playwright/test';

for (const mode of ['getter', 'read', 'write', 'index']) {
  test(`lessons remain playable when browser storage fails: ${mode}`, async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(mode => {
      if (mode === 'getter') {
        Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } });
      } else {
        const method = mode === 'read' ? 'getItem' : 'setItem';
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (key, ...args) {
          if (mode !== 'index' || key.endsWith(':index')) throw new DOMException('Unavailable', 'QuotaExceededError');
          return original.call(this, key, ...args);
        };
      }
    }, mode);
    await page.goto('/app/learn.html?subject=language');
    await page.getByRole('button', { name: 'Select token runs', exact: true }).click();
    await page.locator('#check-button').click();
    await expect(page.locator('#tutor-message')).toContainText('runs');
    await expect(page.locator('#save-status')).toContainText('Saving is unavailable');
    await page.locator('#reset-button').click();
    await expect(page.getByRole('button', { name: 'Select token runs', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (mode === 'write') await page.screenshot({ path: info.outputPath('verification-storage-recovery.png'), fullPage: true });
    await page.goto('/app/parent.html');
    await expect(page.locator('#subject-cards article')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
}

for (const corruption of ['json', 'version', 'placements', 'progress']) {
  test(`damaged ${corruption} save recovers to playable practice`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/app/learn.html?subject=language');
    await page.getByRole('button', { name: 'Select token runs', exact: true }).click();
    await page.locator('#check-button').click();
    await page.evaluate(corruption => {
      localStorage.setItem('unrelated-data', 'keep');
      const key = 'xander-deane.learning-session:record:ses_demo_language_token-selection_001';
      const record = JSON.parse(localStorage.getItem(key));
      if (corruption === 'progress') {
        const progressKey = Object.keys(localStorage).find(key => key.startsWith('xander-deane.learning-progress:'));
        localStorage.setItem(progressKey, '{"evidence":null}');
      } else if (corruption === 'json') localStorage.setItem(key, '{');
      else {
        if (corruption === 'version') record.contractVersion = 'unsupported';
        else record.currentWorkspaceSnapshot.state.tokens = ['unexpected'];
        localStorage.setItem(key, JSON.stringify(record));
      }
    }, corruption);
    await page.reload();
    await expect(page.locator('#save-status')).toContainText('could not be restored');
    await page.getByRole('button', { name: 'Select token runs', exact: true }).click();
    await page.locator('#check-button').click();
    await expect(page.locator('#tutor-message')).toContainText('runs');
    expect(await page.evaluate(() => localStorage.getItem('unrelated-data'))).toBe('keep');
    await page.goto('/app/parent.html');
    await expect(page.locator('#subject-cards article')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
}

test('unchanged checks count once, including after leaving and restoring a lesson', async ({ page }) => {
  await page.goto('/app/learn.html?subject=language');
  await page.getByRole('button', { name: 'Select token runs', exact: true }).click();
  for (let i = 0; i < 5; i++) await page.locator('#check-button').click();
  await page.reload();
  await page.locator('#check-button').click();
  await page.goto('/app/parent.html');
  await expect(page.locator('#overview-attempts')).toHaveText('1');
  await expect(page.locator('#overview-accuracy')).toHaveText('100%');
});
