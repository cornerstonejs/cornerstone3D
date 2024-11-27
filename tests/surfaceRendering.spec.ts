import { test } from '@playwright/test';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'surfaceRendering');
});

// this is too much for the CI.
test.skip('Surface Segmentation Representation for Volume Viewports', async () => {
  test('should render the segmentation correctly', async ({ page }) => {
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.surfaceRendering.viewport,
      200
    );
  });
});
