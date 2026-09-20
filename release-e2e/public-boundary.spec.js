import { test, expect } from '@playwright/test';

test('isolated learning screens work without unapproved traffic or CSP violations', async ({ page, baseURL }, info) => {
  const errors = [], failed = [], foreign = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  page.on('request', request => { if (new URL(request.url()).origin !== baseURL) foreign.push(request.url()); });
  await page.addInitScript(() => {
    window.cspErrors = [];
    document.addEventListener('securitypolicyviolation', event => window.cspErrors.push(event.violatedDirective));
    localStorage.setItem('xander-deane.tutor-api', 'https://audit.invalid');
    window.__XANDER_TUTOR_API__ = 'https://audit.invalid';
  });
  await page.goto('/app/?subject=language&tutorApi=https://audit.invalid');
  await expect(page).toHaveURL(/learn.html\?subject=language$/);
  await page.getByRole('button', { name: 'Select token runs', exact: true }).click();
  await page.locator('#check-button').click();
  await expect(page.locator('#tutor-message')).not.toBeEmpty();
  expect(await page.evaluate(() => window.cspErrors)).toEqual([]);
  await page.goto('/app/parent.html');
  await expect(page.locator('#overview-attempts')).toHaveText('1');
  for (const subject of ['math', 'science']) {
    await page.goto(`/app/learn.html?subject=${subject}`);
    await expect(page.locator('#workspace-root button').first()).toBeVisible();
    expect(await page.evaluate(() => window.cspErrors)).toEqual([]);
  }
  await page.goto('/app/library.html?activity=rhymes&tutorApi=https://audit.invalid');
  await page.getByRole('button', { name: 'hat', exact: true }).click();
  await expect(page.locator('#library-feedback')).toHaveText('You found it!');
  await page.locator('summary').click();
  await page.locator('#read-aloud').click();
  await expect(page.locator('#read-aloud')).toHaveText('Stop audio');
  await page.locator('#read-aloud').click();
  await page.locator('summary').click();
  await page.screenshot({ path: info.outputPath('public-library.png'), fullPage: true });
  expect(await page.evaluate(() => window.cspErrors)).toEqual([]);
  await page.goto('/app/library.html?activity=color-hunt');
  await page.getByRole('button', { name: 'red', exact: true }).click();
  await expect(page.locator('#library-feedback')).toHaveText('You found it!');
  expect(await page.evaluate(() => window.cspErrors)).toEqual([]);
  for (const route of ['toddler', 'play-together']) {
    await page.goto(`/app/${route}.html`);
    await expect(page.locator('h1')).not.toBeEmpty();
    await expect(page.locator(route === 'toddler' ? '#matching-board button' : '#play-world button').first()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`public-${route}.png`), fullPage: true });
    expect(await page.evaluate(() => window.cspErrors)).toEqual([]);
  }
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
  expect(foreign).toEqual([]);
});

test('release denies diagnostic and server resources and blocks cross-origin connections', async ({ page, request }) => {
  for (const path of ['/app/prototype.html', '/app/tutor-client.js', '/src/app/tutor-api-server.js', '/.env', '/package.json', '/examples/safety/guardian-consent.consent-record.json']) {
    expect((await request.get(path)).status()).toBe(404);
  }
  expect((await request.post('/tutor/respond', { data: {} })).status()).toBe(405);
  await page.goto('/app/library.html');
  const blocked = await page.evaluate(async () => {
    try { await fetch('https://audit.invalid/tutor/respond'); return false; } catch { return true; }
  });
  expect(blocked).toBe(true);
});
