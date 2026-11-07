import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests/browser',
  timeout: 60000,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    browserName: 'chromium',
    channel: process.env.BROWSER_CHANNEL || 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
  },
});
