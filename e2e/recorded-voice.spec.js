import { test, expect } from '@playwright/test';

test('Shanon narration plays locally on request and stops on navigation', async ({ page }) => {
  const audioRequests = [];
  page.on('request', request => { if (request.url().endsWith('.mp3')) audioRequests.push(request.url()); });
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.testAudio = [];
    window.Audio = function(source) {
      const audio = new NativeAudio(source);
      window.testAudio.push(audio);
      return audio;
    };
  });
  await page.goto('/app/library.html?activity=rhymes');
  expect(audioRequests).toEqual([]);
  await page.locator('summary').click();
  await page.locator('#read-aloud').click();
  await expect.poll(() => page.evaluate(() => window.testAudio[0]?.currentTime ?? 0)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.locator('#next').click();
  expect(await page.evaluate(() => window.testAudio[0].paused)).toBe(true);
  await expect(page.locator('#read-aloud')).toHaveText('Read aloud');
  expect(audioRequests[0]).toContain('/app/assets/voice/shanon/rhyme-cat.mp3');
  await page.locator('summary').click();
  await page.locator('#read-aloud').click();
  await expect(page.locator('#read-aloud')).toHaveText('Stop audio');
  await page.locator('#read-aloud').click();
  expect(await page.evaluate(() => window.testAudio[1].paused)).toBe(true);
});
