import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 720 * 1000,
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
        '**/renderingPipeline.spec.ts',
      ],
    },
  ],
  webServer: {
    command: 'yarn build-and-serve-static-examples',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 150 * 1000,
  },
});
