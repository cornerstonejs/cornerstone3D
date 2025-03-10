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

// Test for circular eraser tool with segmentation 2
test('Stack Segmentation - Circular Eraser Tool with segmentation 2', async ({
  page,
  browserName,
}) => {
  if (!['chromium', 'webkit'].includes(browserName)) {
    return;
  }

  await page.getByRole('combobox').first().selectOption('CircularBrush');

  const canvas = await page.locator('canvas').first();

  await simulateDrawPath(page, canvas, [...rightArmBoneContour, [120, 150]], {
    interpolateSteps: true,
    closePath: true,
  });

  await page
    .getByRole('button', { name: 'Create New Segmentation on' })
    .click();

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
    screenShotPaths.stackSegmentation.circularEraserSegmentation2
  );
});
