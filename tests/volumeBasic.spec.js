import { test } from '@playwright/test';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'volumeBasic');
});

test.describe('Basic Volume', async () => {
  test('should display a single DICOM series in a Volume viewport.', async ({
    page,
  }) => {
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.volumeBasic.viewport
    );
  });
});
