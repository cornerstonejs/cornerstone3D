import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 8,
  snapshotPathTemplate:
    'tests/screenshots{/projectName}/{testFilePath}/{arg}{ext}',
  outputDir: './tests/test-results',
  reporter: [['html', { outputFolder: './tests/playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'on',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2 },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], deviceScaleFactor: 1 },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], deviceScaleFactor: 2 },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: 'yarn build-and-serve-static-examples',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
