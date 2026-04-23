import { defineConfig, devices } from '@playwright/test';

const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === 'true'
    ? true
    : process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === 'false'
      ? false
      : !process.env.CI;

const video =
  process.env.PLAYWRIGHT_VIDEO === 'off' ? 'off' : 'retain-on-failure';

const useBundledChromium =
  process.env.PLAYWRIGHT_USE_BUNDLED_CHROMIUM === 'true' ||
  process.env.PLAYWRIGHT_CHROMIUM_CHANNEL === 'bundled';

const chromiumProjectUse = {
  ...devices['Desktop Chrome'],
  ...(useBundledChromium
    ? {}
    : { channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || 'chrome' }),
  deviceScaleFactor: 1,
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  globalSetup: './playwright.globalSetup.ts',
  retries: process.env.CI ? 3 : 0,
  workers: Number(process.env.PLAYWRIGHT_WORKERS) || 8,
  timeout: 120 * 1000,
  snapshotPathTemplate:
    'tests/screenshots{/projectName}/{testFilePath}/{arg}{ext}',
  outputDir: './tests/test-results',
  reporter: [
    [
      process.env.CI ? 'blob' : 'html',
      {
        outputFolder: './packages/docs/static/playwright-report',
        open: 'never',
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:3333',
    actionTimeout: 5000,
    trace: 'on-first-retry',
    video,
  },

  projects: [
    {
      name: 'slow-tests',
      testMatch: /.+@slow.+/,
      use: chromiumProjectUse,
    },
    {
      name: 'chromium',
      testIgnore: /.+@slow.+/,
      use: chromiumProjectUse,
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
        '**/interpolationContourSegmentation.spec.ts',
        '**/stackLabelmapSegmentation.spec.ts',
        '**/rectangleROIThresholdStatisticsMIM.spec.ts',
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
        '**/interpolationContourSegmentation.spec.ts',
        '**/stackLabelmapSegmentation.spec.ts',
        '**/rectangleROIThresholdStatisticsMIM.spec.ts',
        '**/stackLabelmapSegmentation/**.spec.ts',
      ],
    },
  ],
  webServer: {
    command: 'npx serve .static-examples --listen 3333',
    url: 'http://localhost:3333',
    reuseExistingServer,
    gracefulShutdown: {
      signal: 'SIGTERM',
      timeout: 5000,
    },
    timeout: 500 * 1000,
  },
});
