import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
  simulateDrawPath,
} from './utils/index';

const segmentPoints1 = [
  [100, 197],
  [98, 221],
  [115, 233],
  [129, 232],
  [129, 207],
  [118, 194],
];

const segmentPoints2 = [
  [397, 142],
  [384, 171],
  [391, 202],
  [411, 181],
  [414, 152],
];

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackSegmentation');
});

test.describe('Stack Segmentation', async () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('slider').fill('5');
  });

  test('should load the segmentation on a stack viewport', async ({ page }) => {
    const canvas = await page.locator('canvas');

    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.stackSegmentation.defaultSegmentation
    );
  });

  test.describe('when using circular brush tool', async () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('combobox').first().selectOption('CircularBrush');
    });

    test('should draw a new segment', async ({ page }) => {
      const canvas = await page.locator('canvas');

      await simulateDrawPath(page, canvas, segmentPoints1, {
        interpolateSteps: true,
        closePath: true,
      });

      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.stackSegmentation.circularBrushSegment1
      );
    });
  });

  test.describe('when using paint fill tool', async () => {
    test.beforeEach(async ({ page }) => {
      const canvas = await page.locator('canvas');

      await page.getByRole('combobox').first().selectOption('CircularBrush');

      // Draw segment 1
      await simulateDrawPath(page, canvas, segmentPoints1, {
        interpolateSteps: true,
        closePath: true,
      });

      await page.getByRole('combobox').first().selectOption('PaintFill');
    });

    // TODO: investigate why CLICK is not working
    //
    // test('should be able to fill a segment', async ({ page }) => {
    //   const canvas = await page.locator('canvas');
    //
    //   // Click close to the center of segment 1
    //   await canvas.click({
    //     position: {
    //       x: 115,
    //       y: 215,
    //     },
    //   });
    //
    //   await checkForScreenshot(
    //     page,
    //     canvas,
    //     screenShotPaths.stackSegmentation.paintFill
    //   );
    // });
  });
});
