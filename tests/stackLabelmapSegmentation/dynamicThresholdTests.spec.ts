import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
  simulateDrawPath,
} from '../utils/index';
import { leftArmContour } from './utils/constants';
import locatorToPageCoord from '../utils/locatorToPageCoord';
import pause from '../utils/pause';

// Common setup for all tests
test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stacklabelmapsegmentation');
});

// Test for dynamic threshold tool - initial highlight
test('Stack Segmentation - Dynamic Threshold Tool - Initial Highlight', async ({
  page,
  browserName,
}) => {
  await page.getByRole('combobox').first().selectOption('DynamicThreshold');
  await page.getByRole('slider').fill('25');

  const canvas = await page.locator('canvas').first();
  const canvasPoint = leftArmContour[0];
  const pagePoint = await locatorToPageCoord(canvas, canvasPoint);

  await page.mouse.move(pagePoint[0], pagePoint[1]);
  await pause(1000);

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.dynamicThresholdInitialHighlightedPixels
  );
});

// Test for dynamic threshold tool - highlight contour
test('Stack Segmentation - Dynamic Threshold Tool - Highlight Contour', async ({
  page,
  browserName,
}) => {
  await page.getByRole('combobox').first().selectOption('DynamicThreshold');
  await page.getByRole('slider').fill('25');

  const canvas = await page.locator('canvas').first();

  await simulateDrawPath(page, canvas, leftArmContour, {
    interpolateSteps: true,
  });

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.dynamicThresholdHighlightedContour
  );
});

// Test for dynamic threshold tool - confirm contour
test('Stack Segmentation - Dynamic Threshold Tool - Confirm Contour', async ({
  page,
  browserName,
}) => {
  await page.getByRole('combobox').first().selectOption('DynamicThreshold');
  await page.getByRole('slider').fill('25');

  const canvas = await page.locator('canvas').first();

  await simulateDrawPath(page, canvas, leftArmContour, {
    interpolateSteps: true,
  });

  page.keyboard.press('Enter');

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.dynamicThresholdConfirmedContour
  );
});
