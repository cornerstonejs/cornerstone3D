import { test } from 'playwright-test-coverage';
import {
  checkForScreenshot,
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
    const canvas = await page.locator('canvas');

    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.labelmapSwapping.defaultSegmentation
    );
  });

  test('should swap the segmentation after clicking on "Swap Segmentation" button', async ({
    page,
  }) => {
    const canvas = await page.locator('canvas');

    await page.getByRole('button', { name: 'Swap Segmentation' }).click();
    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.labelmapSwapping.swappedSegmentation
    );
  });
});
