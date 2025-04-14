import { test } from '@playwright/test';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackToVolumeFusion');
});

test.describe('Stack to Volume Fusion', async () => {
  test('should display a single DICOM series in a Volume viewport.', async ({
    page,
  }) => {
    // wait 2 seconds
    await page.waitForTimeout(2000);

    // click on button that says 'Stack to Volume'
    await page.click('button:has-text("Stack to Volume")');

    // wait 2 seconds
    await page.waitForTimeout(2000);

    // Now take the screenshot
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackToVolumeFusion.viewport
    );
  });
});
