import { test, expect } from '@playwright/test';
import {
  visitExample,
  waitForRequest,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.describe('Basic Stack', async () => {
  test('should display a single DICOM image in a Stack viewport.', async ({
    page,
  }) => {
    await visitExample(page, 'stackBasic');
    await waitForRequest(page);
    const locator = await page.locator('.cornerstone-canvas');

    const screenshotMatches = await checkForScreenshot(
      locator,
      screenShotPaths.stackBasic.viewport
    );

    if (!screenshotMatches) {
      throw new Error('Screenshot does not match.');
    }
  });
});
