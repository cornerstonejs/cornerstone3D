import { test } from 'playwright-test-coverage';
import {
  checkForCanvasSnapshot,
  visitExample,
  screenShotPaths,
  getVisibleViewportCanvas,
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
  await page.getByRole('combobox').first().selectOption('CircleScissor');

  const canvas = getVisibleViewportCanvas(page, 0);

  await drawCircleScissor(page, canvas);
  await page.waitForTimeout(1500);

  await checkForCanvasSnapshot(
    page,
    '',
    screenShotPaths.stackSegmentation.circularScissorSegmentation1,
    0,
    { threshold: 0.01 }
  );
});
