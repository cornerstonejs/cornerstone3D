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

// Test for circular brush tool
test('Stack Segmentation - Circular Brush Tool', async ({
  page,
  browserName,
}) => {
  if (!['chromium', 'webkit'].includes(browserName)) {
    expect(true).toBe(true);
    return;
  }

  await page.getByRole('combobox').first().selectOption('CircularBrush');

  const canvas = await page.locator('canvas').first();

  await simulateDrawPath(page, canvas, rightArmBoneContour, {
    interpolateSteps: true,
    closePath: true,
  });

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.circularBrushSegment1
  );
});
