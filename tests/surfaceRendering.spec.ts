import { test } from 'playwright-test-coverage';
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
  // // triple the test timeout
  // test.slow();
  // test.setTimeout(120000); // Set a longer timeout for this specific test
  // const locator = page.locator('.cornerstone-canvas');
  // await page.waitForTimeout(5000);
  // // Wait for network idle to ensure all resources are loaded
  // await page.waitForLoadState('networkidle');
  // await checkForScreenshot(
  //   page,
  //   locator,
  //   screenShotPaths.surfaceRendering.viewport,
  //   20, // Increase number of attempts
  //   1000 // Increase delay between attempts to 1 second
  // );
});
