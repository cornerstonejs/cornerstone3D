import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
  simulateDrawPath,
} from '../utils/index';
import { rightArmBoneContour } from './utils/constants';

// Common setup for test
test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stacklabelmapsegmentation');
});

// Test for circular eraser tool with segmentation 1
test('Stack Segmentation - Circular Eraser Tool with segmentation 1', async ({
  page,
}) => {
  test.skip(
    ({ browserName }) => ['chromium', 'webkit'].includes(browserName),
    'Skipping test for non-chromium/webkit browsers'
  );
  await page.getByRole('combobox').first().selectOption('CircularBrush');

  const canvas = await page.locator('canvas').first();

  await simulateDrawPath(page, canvas, rightArmBoneContour, {
    interpolateSteps: true,
    closePath: true,
  });

  await page.getByRole('combobox').first().selectOption('CircularEraser');

  await simulateDrawPath(
    page,
    canvas,
    [
      [100, 197],
      [98, 221],
      [115, 233],
    ],
    {
      interpolateSteps: true,
      closePath: true,
    }
  );

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.circularEraserSegmentation1
  );
});
