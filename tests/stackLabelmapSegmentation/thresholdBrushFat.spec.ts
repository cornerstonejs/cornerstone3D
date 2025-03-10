import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
  simulateDrawPath,
} from '../utils/index';
import { leftArmContour } from './utils/constants';

// Common setup for test
test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stacklabelmapsegmentation');
});

// Test for threshold brush tool with CT Fat
test('Stack Segmentation - Threshold Brush Tool with CT Fat', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('ThresholdBrush');
  await page.getByRole('slider').fill('25');

  const canvas = await page.locator('canvas').first();

  await page.locator('#thresholdDropdown').selectOption('CT Fat: (-150, -70)');

  await simulateDrawPath(page, canvas, leftArmContour, {
    interpolateSteps: true,
    closePath: true,
  });

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.thresholdBrushFatSegment1
  );
});
