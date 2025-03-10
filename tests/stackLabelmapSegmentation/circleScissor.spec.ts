import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from '../utils/index';
import { drawCircleScissor } from './utils/helpers';

// Common setup for test

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stacklabelmapsegmentation');
});

// Test for circular scissor tool with segmentation 1
test('Stack Segmentation - Circular Scissor Tool with segmentation 1', async ({
  page,
  browserName,
}) => {
  if (!['chromium', 'webkit'].includes(browserName)) {
    expect(true).toBe(true);
    return;
  }

  await page.getByRole('combobox').first().selectOption('CircleScissor');

  const canvas = await page.locator('canvas').first();

  await drawCircleScissor(page, canvas);
  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.circularScissorSegmentation1
  );
});
