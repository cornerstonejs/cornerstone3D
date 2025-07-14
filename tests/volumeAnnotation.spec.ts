import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
  simulateDrag,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'volumeAnnotationTools');
});

test.describe('Volume Annotation Tools', async () => {
  test('should draw a length measurement on the viewport', async ({ page }) => {
    const locator = page.locator('.cornerstone-canvas').nth(0);
    await simulateDrag(page, locator);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.volumeAnnotation.lengthTool
    );
  });
});
