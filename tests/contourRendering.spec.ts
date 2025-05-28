import { test } from 'playwright-test-coverage';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'contourRendering');
});

test.describe('Contour Rendering', async () => {
  test('should add a contour as a segmentation to a volume viewport', async ({
    page,
  }) => {
    const canvas = await page.locator('canvas');

    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.contourRendering.viewport
    );
  });
});
