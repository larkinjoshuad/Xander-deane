import { defineConfig, devices } from '@playwright/test';

if (!process.env.PUBLIC_TEST_URL) throw new Error('Run npm run test:public to build and start the isolated test server.');

export default defineConfig({
  testDir: './release-e2e',
  timeout: 30000,
  use: { baseURL: process.env.PUBLIC_TEST_URL, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'public-desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'public-phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'public-tablet-webkit', use: { ...devices['iPad (gen 7)'], browserName: 'webkit', viewport: { width: 820, height: 1180 } } },
  ],
});
