import { test } from 'playwright-test-coverage';
import {
  checkForCanvasSnapshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'labelmapSwapping');
});

test.describe('Swapping labelmap segmentations on a viewport', async () => {
  test('should load the default segmentation with two segments (circles)', async ({
    page,
  }) => {
    await checkForCanvasSnapshot(
      page,
      ".cornerstone-canvas",
      screenShotPaths.labelmapSwapping.defaultSegmentation
    );
  });

  test('should swap the segmentation after clicking on "Swap Segmentation" button', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Swap Segmentation' }).click();
    await checkForCanvasSnapshot(
      page,
      'canvas.cornerstone-canvas',
      screenShotPaths.labelmapSwapping.swappedSegmentation
    );
  });
});
