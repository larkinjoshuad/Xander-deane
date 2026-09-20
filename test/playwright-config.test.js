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

test('isolated release coverage includes actual WebKit alongside Chromium', async () => {
  const previous = process.env.PUBLIC_TEST_URL;
  let publicConfig;
  try {
    process.env.PUBLIC_TEST_URL = 'http://127.0.0.1:12345';
    publicConfig = (await import('../playwright.public.config.js')).default;
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_TEST_URL;
    else process.env.PUBLIC_TEST_URL = previous;
  }
  assert.deepEqual(new Set(publicConfig.projects.map(project => project.use.browserName)), new Set(['chromium', 'webkit']));
  const tablet = publicConfig.projects.find(project => project.name === 'public-tablet-webkit');
  assert.equal(tablet.use.browserName, 'webkit');
  assert.equal(tablet.use.hasTouch, true);
  assert.equal(tablet.use.isMobile, true);
});
