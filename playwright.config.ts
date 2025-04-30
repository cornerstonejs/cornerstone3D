import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 3 : 0,
  workers: process.env.CI ? 16 : undefined,
  timeout: 120 * 1000,
  snapshotPathTemplate:
    'tests/screenshots{/projectName}/{testFilePath}/{arg}{ext}',
  outputDir: './tests/test-results',
  reporter: [
    [
      process.env.CI ? 'blob' : 'html',
      { outputFolder: './packages/docs/static/playwright-report' },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3333',
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
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 15'],
        deviceScaleFactor: 1,
        viewport: { width: 500, height: 1000 },
        hasTouch: true,
        isMobile: true,
      },
      testIgnore: [
        '**/labelmapsegmentationtools.spec.ts',
        '**/splineContourSegmentationTools.spec.ts',
        '**/stackLabelmapSegmentation.spec.ts',
        '**/renderingPipeline.spec.ts',
        '**/stackLabelmapSegmentation/**.spec.ts',
      ],
    },
    {
      name: 'Mobile Android',
      use: {
        ...devices['Pixel 7'],
        deviceScaleFactor: 1,
        viewport: { width: 500, height: 1000 },
        hasTouch: true,
        isMobile: true,
      },
      testIgnore: [
        '**/labelmapsegmentationtools.spec.ts',
        '**/splineContourSegmentationTools.spec.ts',
        '**/stackLabelmapSegmentation.spec.ts',
        '**/stackLabelmapSegmentation/**.spec.ts',
      ],
    },
  ],
  webServer: {
    command: 'COVERAGE=true nyc yarn build-and-serve-static-examples',
    url: 'http://localhost:3333',
    reuseExistingServer: !process.env.CI,
    timeout: 500 * 1000,
  },
});
