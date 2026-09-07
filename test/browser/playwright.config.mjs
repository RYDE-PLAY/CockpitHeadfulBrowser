import { defineConfig, devices } from '@playwright/test';

const projects = [
  {
    name: 'chromium',
    testMatch: '**/smoke.mjs',
    use: { browserName: 'chromium' },
  },
];

if (process.env.PLAYWRIGHT_WEBKIT) {
  projects.push({
    name: 'webkit-mobile',
    testMatch: '**/mobile.mjs',
    use: { ...devices['iPhone 13'], browserName: 'webkit' },
  });
}

export default defineConfig({
  testDir: '.',
  testMatch: '**/smoke.mjs',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || '/tmp/cockpit-browser-playwright',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { outputFolder: '/tmp/cockpit-browser-playwright-report', open: 'never' }]] : 'line',
  projects,
  use: { headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
