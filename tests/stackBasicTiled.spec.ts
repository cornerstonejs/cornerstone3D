import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page, context }) => {
  await visitExample(page, 'stackBasic');
  await context.addInitScript(() => (window.IS_TILED = true));
});

test.describe('Basic Stack', async () => {
  test('should display a single DICOM image in a Stack viewport', async ({
    page,
  }) => {
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackBasicTiled.viewport
    );
  });
});
