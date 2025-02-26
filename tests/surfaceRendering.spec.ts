import { test } from '@playwright/test';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'surfaceRenderingForTest');
});

// this is too much for the CI.
test('should render the segmentation correctly', async ({ page }) => {
  // triple the test timeout
  test.slow();

  const locator = page.locator('.cornerstone-canvas');

  await page.waitForTimeout(3000);

  await checkForScreenshot(
    page,
    locator,
    screenShotPaths.surfaceRendering.viewport,
    15,
    500
  );
});
