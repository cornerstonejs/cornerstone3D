import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
  simulateDrawPath,
} from '../utils/index';
import { leftArmBoneContour } from './utils/constants';

// Common setup for test
test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stacklabelmapsegmentation');
});

// Test for threshold brush tool with CT Bone
test('Stack Segmentation - Threshold Brush Tool with CT Bone', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('ThresholdBrush');
  await page.getByRole('slider').fill('25');

  const canvas = await page.locator('canvas').first();

  await page.locator('#thresholdDropdown').selectOption('CT Bone: (200, 1000)');

  await simulateDrawPath(page, canvas, leftArmBoneContour, {
    interpolateSteps: true,
    closePath: true,
  });

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.thresholdBrushBoneSegment1
  );
});
