import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForScreenshot,
  checkForCanvasSnapshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page, context }) => {
  await visitExample(page, 'volumeBasic');
  await context.addInitScript(() => (window.IS_TILED = true));
});

test.describe('Basic Volume', async () => {
  test('should display a single DICOM series in a Volume viewport.', async ({
    page,
  }) => {
    // Now take the screenshot
    await checkForCanvasSnapshot(
      page,
      ".cornerstone-canvas",
      screenShotPaths.volumeBasicTiled.viewport
    );
  });
});
