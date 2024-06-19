import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 120 * 1000,
  snapshotPathTemplate:
    'tests/screenshots{/projectName}/{testFilePath}/{arg}{ext}',
  outputDir: './tests/test-results',
  reporter: [
    [
      process.env.CI ? 'blob' : 'html',
      { outputFolder: './tests/playwright-report' },
    ],
  ],
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
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], deviceScaleFactor: 1 },
    },
    // This is commented out until SharedArrayBuffer is enabled in WebKit
    // See: https://github.com/microsoft/playwright/issues/14043
    //{
    //  name: 'webkit',
    //  use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 },
    //},
  ],
  webServer: {
    command: 'yarn build-and-serve-static-examples',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
