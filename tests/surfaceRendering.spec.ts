import { test } from '@playwright/test';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
  reduceViewportsSize,
  attemptAction,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'surfaceRendering', 0, false, false);
});

test.describe('Surface Segmentation Representation for Volume Viewports', async () => {
  test('should render the segmentation correctly', async ({ page }) => {
    const locator = page.locator('.cornerstone-canvas');
    await attemptAction(() => reduceViewportsSize(page), 1000, 10);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.surfaceRendering.viewport,
      200
    );
  });
});
