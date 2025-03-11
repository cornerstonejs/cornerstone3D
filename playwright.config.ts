import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 8,
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
      name: 'slow-tests',
      testMatch: /.+@slow.+/,
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
    },
    {
      name: 'chromium',
      testIgnore: /.+@slow.+/,
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 },
      testIgnore: ['**/renderingPipeline.spec.ts'],
    },
  ],
  webServer: {
    command: 'yarn build-and-serve-static-examples',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 500 * 1000,
  },
});
