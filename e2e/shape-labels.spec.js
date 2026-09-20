import { test, expect } from '@playwright/test';

for (const width of [390, 820]) test(`shape pictures have readable names at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/app/toddler.html');
  await page.getByRole('button', { name: 'Shapes', exact: true }).click();
  for (const pair of [['circle','square'], ['triangle','oval'], ['star','heart']]) {
    for (const shape of pair) {
      const name = shape[0].toUpperCase() + shape.slice(1);
      const piece = page.getByRole('button', { name: `Match ${shape}`, exact: true });
      const target = page.getByRole('button', { name: `${shape} target`, exact: true });
      await expect(piece.locator('.shape-name')).toHaveText(name);
      await expect(target.locator('.shape-name')).toHaveText(name);
      const imageBox = await piece.locator('.matching-shape').boundingBox();
      const labelBox = await piece.locator('.shape-name').boundingBox();
      const buttonBox = await piece.boundingBox();
      expect(labelBox.y).toBeGreaterThanOrEqual(imageBox.y + imageBox.height);
      expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(buttonBox.y + buttonBox.height);
      await piece.click();
      await target.click();
    }
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.screenshot({ path: info.outputPath('named-shapes.png'), fullPage: true });
  await page.goto('/app/library.html?activity=shape-hunt');
  for (const shape of ['circle','square','triangle','oval','star','heart']) {
    const button = page.getByRole('button', { name: shape, exact: true });
    await expect(button.locator('.shape-name')).toHaveText(shape[0].toUpperCase() + shape.slice(1));
    await button.click();
    await expect(page.getByRole('status')).toHaveText('You found it!');
    if (shape !== 'heart') await page.getByRole('button', { name: 'Next problem' }).click();
  }
  await page.screenshot({ path: info.outputPath('named-shape-hunt.png'), fullPage: true });
});
