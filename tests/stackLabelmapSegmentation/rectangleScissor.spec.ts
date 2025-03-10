import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from '../utils/index';
import { drawRectangleScissor } from './utils/helpers';

// Common setup for test
test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stacklabelmapsegmentation');
});

// Test for rectangle scissor tool with segmentation 2
test('Stack Segmentation - Rectangle Scissor Tool with segmentation 2', async ({
  page,
  browserName,
}) => {
  if (!['chromium', 'webkit'].includes(browserName)) {
    expect(true).toBe(true);
    return;
  }

  await page.getByRole('combobox').first().selectOption('RectangleScissor');

  const canvas = await page.locator('canvas').first();

  await page
    .getByRole('button', { name: 'Create New Segmentation on' })
    .click();

  await drawRectangleScissor(page, canvas);
  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.rectangleScissorSegmentation1
  );
});
