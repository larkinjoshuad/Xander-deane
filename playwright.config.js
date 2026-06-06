import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://127.0.0.1:${PORT}/app/`,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'tablet-chromium',
      use: {
        ...devices['iPad (gen 7)'],
        viewport: { width: 820, height: 1180 },
      },
    },
    {
      name: 'phone-chromium',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'glasses-glance-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: false,
        deviceScaleFactor: 2,
      },
    },
  ],
});
