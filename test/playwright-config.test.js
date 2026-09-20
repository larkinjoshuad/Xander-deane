import assert from 'node:assert/strict';
import { test } from 'node:test';
import config from '../playwright.config.js';

test('Chromium projects use Chromium even when a device preset defaults to another engine', () => {
  const projects = config.projects.filter((project) => project.name.endsWith('-chromium'));
  assert.equal(projects.length, 4);

  for (const project of projects) {
    const use = { ...config.use, ...project.use };
    assert.equal(
      use.browserName ?? use.defaultBrowserType ?? 'chromium',
      'chromium',
      `${project.name} must support the Chromium touch-event test helpers`,
    );
  }
});

test('tablet browser tests retain mobile touch emulation and the tablet viewport', () => {
  const tablet = config.projects.find((project) => project.name === 'tablet-chromium');
  assert.ok(tablet);
  assert.equal(tablet.use.hasTouch, true);
  assert.equal(tablet.use.isMobile, true);
  assert.deepEqual(tablet.use.viewport, { width: 820, height: 1180 });
});
