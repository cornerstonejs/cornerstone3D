import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForScreenshot,
  checkForCanvasSnapshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackBasic');
});

test.describe('Basic Stack', async () => {
  test('should display a single DICOM image in a Stack viewport', async ({
    page,
  }) => {
    await checkForCanvasSnapshot(
      page,
      ".cornerstone-canvas",
      screenShotPaths.stackBasic.viewport
    );
  });
});
