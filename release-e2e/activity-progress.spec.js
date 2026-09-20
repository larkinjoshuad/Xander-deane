import { test, expect } from '@playwright/test';

const prefix = 'xander-deane.activity-progress.v1.';
const choose = (page, name) => page.getByRole('button', { name, exact: true }).click();

test('choice progress survives refresh, subject switching, previous and round-only reset', async ({ page, context }) => {
  await page.goto('/app/library.html?activity=color-hunt');
  await choose(page, 'blue');
  await page.reload();
  await expect(page.getByRole('button', { name: 'blue', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#library-feedback')).toContainText('try again');
  await choose(page, 'red');
  await page.locator('#continue').click();
  await choose(page, 'yellow');
  await choose(page, 'Math');
  await choose(page, 'Toddlers');
  await expect(page.locator('#round-position')).toHaveText('2 of 6');
  await expect(page.getByRole('button', { name: 'yellow', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const another = await context.newPage();
  await another.goto('/app/library.html?activity=color-hunt');
  await expect(another.locator('#round-position')).toHaveText('2 of 6');
  await another.close();
  await page.locator('#previous').click();
  await expect(page.locator('#library-feedback')).toHaveText('You found it!');
  await page.locator('#again').click();
  await page.reload();
  await expect(page.locator('#library-feedback')).toBeEmpty();
  await expect(page.locator('.library-choice:enabled')).toHaveCount(3);
  await page.locator('#next').click();
  await expect(page.getByRole('button', { name: 'yellow', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('sequences resume partial and checked states without silently approving an unchecked answer', async ({ page }) => {
  await page.goto('/app/library.html?activity=number-order');
  await choose(page, '1');
  await page.reload();
  await expect(page.locator('.order-slot').first()).toHaveText('1');
  await expect(page.getByRole('button', { name: '1', exact: true })).toBeDisabled();
  await choose(page, '2'); await choose(page, '3');
  await page.reload();
  await expect(page.locator('#continue')).toBeHidden();
  await expect(page.locator('#check')).toBeEnabled();
  await page.locator('#check').click();
  await page.reload();
  await expect(page.locator('#library-feedback')).toHaveText('That order works!');
  await expect(page.locator('#continue')).toBeVisible();
  await page.locator('#again').click();
  for (const name of ['3', '1', '2']) await choose(page, name);
  await page.locator('#check').click();
  await page.reload();
  await expect(page.locator('#library-feedback')).toContainText('change the order');
  await page.locator('#undo').click();
  await page.reload();
  await expect(page.locator('#check')).toBeDisabled();
  await expect(page.locator('.order-slot').nth(2)).toHaveText('3');
  await expect(page.getByRole('button', { name: '2', exact: true })).toBeEnabled();
});

test('memory resumes the same shuffled deck, exposed cards and completed pairs', async ({ page }) => {
  await page.goto('/app/library.html?activity=picture-memory');
  const deck = await page.locator('[data-card]').evaluateAll(buttons => buttons.map(button => button.dataset.choice));
  const firstPair = deck.map((id, i) => id === deck[0] ? i : -1).filter(i => i >= 0);
  const otherPair = deck.map((id, i) => id !== deck[0] ? i : -1).filter(i => i >= 0);
  const card = i => page.locator(`[data-card="${i}"]`);
  await card(firstPair[0]).click();
  await page.reload();
  expect(await page.locator('[data-card]').evaluateAll(buttons => buttons.map(button => button.dataset.choice))).toEqual(deck);
  await expect(card(firstPair[0])).toHaveAttribute('data-hidden', 'false');
  await card(otherPair[0]).click();
  await page.reload();
  await expect(page.locator('[data-hidden="false"]')).toHaveCount(2);
  await expect(page.locator('#library-feedback')).toContainText('different pictures');
  await card(firstPair[1]).click();
  await card(firstPair[0]).click();
  await page.selectOption('#activity', 'shape-hunt');
  await page.selectOption('#activity', 'picture-memory');
  await expect(page.locator('.correct')).toHaveCount(2);
  await page.reload();
  await expect(card(firstPair[0])).toBeDisabled();
  for (const i of otherPair) await card(i).click();
  await page.reload();
  await expect(page.locator('#library-feedback')).toHaveText('All the pairs! Nicely found.');
  await page.locator('#again').click();
  await page.reload();
  await expect(page.locator('[data-hidden="true"]')).toHaveCount(4);
});

test('invalid and outdated saves recover without blocking play', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app/library.html?activity=color-hunt');
  const valid = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefix + 'color-hunt');
  for (const raw of ['{', 'x'.repeat(100001), JSON.stringify({ ...valid, contentKey: 'old content' }), JSON.stringify({ ...valid, currentRound: 999 }), JSON.stringify({ ...valid, learnerName: 'not-allowed' })]) {
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: prefix + 'color-hunt', raw });
    await page.reload();
    await expect(page.locator('#round-position')).toHaveText('1 of 6');
    await choose(page, 'red');
    await expect(page.locator('#library-feedback')).toHaveText('You found it!');
  }
  expect(errors).toEqual([]);
});

for (const failure of ['quota', 'unavailable']) {
  test(`${failure} storage keeps games usable and announces temporary progress`, async ({ page }, info) => {
    await page.addInitScript(failure => {
      if (failure === 'quota') Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
      else Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    }, failure);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/app/library.html?activity=color-hunt');
    await choose(page, 'red');
    await page.locator('#continue').click();
    await page.selectOption('#activity', 'shape-hunt');
    await page.selectOption('#activity', 'color-hunt');
    await expect(page.locator('#round-position')).toHaveText('2 of 6');
    await expect(page.locator('#save-status')).toHaveText('Progress is temporary on this device.');
    await page.screenshot({ path: info.outputPath('temporary-progress.png'), fullPage: true });
    await page.reload();
    await expect(page.locator('#round-position')).toHaveText('1 of 6');
    expect(errors).toEqual([]);
  });
}

test('clear progress is confirmed, scoped to the library and honest about deletion failures', async ({ page }) => {
  await page.goto('/app/library.html?activity=color-hunt');
  await page.evaluate(() => localStorage.setItem('unrelated-test-preference', 'keep'));
  await choose(page, 'red');
  await page.locator('#continue').click();
  await page.selectOption('#activity', 'shape-hunt');
  await page.selectOption('#activity', 'color-hunt');
  await page.locator('summary').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#clear-progress').click();
  await expect(page.locator('#round-position')).toHaveText('2 of 6');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear-progress').click();
  await expect(page.locator('#round-position')).toHaveText('1 of 6');
  expect(await page.evaluate(() => localStorage.getItem('unrelated-test-preference'))).toBe('keep');
  expect(await page.evaluate(key => localStorage.getItem(key), prefix + 'shape-hunt')).toBeNull();
  await page.reload();
  await expect(page.locator('#round-position')).toHaveText('1 of 6');
  await page.evaluate(() => { Storage.prototype.removeItem = () => { throw new DOMException('blocked', 'SecurityError'); }; });
  await page.locator('summary').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear-progress').click();
  await expect(page.locator('#save-status')).toContainText('could not be fully cleared');
});
