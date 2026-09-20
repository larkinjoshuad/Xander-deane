import { test, expect } from '@playwright/test';

async function shapeGeometry(page, selector) {
  const shapes = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    const parent = node.parentElement.getBoundingClientRect();
    return { oval: node.classList.contains('shape-oval'), width: box.width, height: box.height, parentWidth: parent.width, parentHeight: parent.height };
  }));
  expect(shapes.length).toBeGreaterThan(0);
  for (const shape of shapes) {
    expect(shape.width).toBeGreaterThan(0);
    expect(shape.height / shape.width).toBeCloseTo(shape.oval ? .65 : 1, 2);
    expect(shape.width).toBeLessThanOrEqual(shape.parentWidth + 1);
    expect(shape.height).toBeLessThanOrEqual(shape.parentHeight + 1);
  }
  return shapes;
}

for (const width of [320, 390, 768, 1280]) {
  test(`shape proportions and size ordering stay correct at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app/library.html?activity=shape-hunt');
    for (let round = 0; round < 6; round++) {
      await shapeGeometry(page, '.library-choice .matching-shape');
      if (round === 0) await page.screenshot({ path: info.outputPath('shape-hunt.png'), fullPage: true });
      if (round < 5) await page.locator('#next').click();
    }
    await page.selectOption('#activity', 'size-order');
    for (let round = 0; round < 6; round++) {
      await shapeGeometry(page, '.library-choice .matching-shape');
      for (const size of ['small', 'medium', 'large']) await page.locator(`[data-choice="${size}"]`).click();
      const ordered = await shapeGeometry(page, '.order-slot .matching-shape');
      expect(ordered[0].width).toBeLessThan(ordered[1].width);
      expect(ordered[1].width).toBeLessThan(ordered[2].width);
      await page.locator('#check').click();
      await expect(page.locator('#library-feedback')).toHaveText('That order works!');
      if (round < 5) await page.locator('#continue').click();
    }
  });
}

test('arithmetic retries retain choice positions and accept only the calculated answer', async ({ page }) => {
  for (const activity of ['add', 'subtract', 'multiply']) {
    await page.goto(`/app/library.html?activity=${activity}`);
    for (let round = 0; round < 3; round++) {
      const prompt = await page.locator('#library-prompt').textContent();
      const [a, b] = prompt.match(/\d+/g).map(Number);
      const answer = String(activity === 'add' ? a + b : activity === 'subtract' ? a - b : a * b);
      const before = await page.locator('.library-choice').allTextContents();
      await page.getByRole('button', { name: before.find(value => value !== answer), exact: true }).click();
      await expect(page.locator('#library-feedback')).toContainText('try again');
      expect(await page.locator('.library-choice').allTextContents()).toEqual(before);
      await page.getByRole('button', { name: answer, exact: true }).click();
      await expect(page.locator('#library-feedback')).toHaveText('You found it!');
      await page.locator('#continue').click();
    }
  }
});
