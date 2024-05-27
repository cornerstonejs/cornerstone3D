import { test } from '@playwright/test';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackBasic');
});

test.describe('Basic Stack', async () => {
  test('should display a single DICOM image in a Stack viewport.', async ({
    page,
  }) => {
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackBasic.viewport
    );
  });
});
