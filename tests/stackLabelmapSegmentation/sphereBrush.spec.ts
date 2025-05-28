import { test } from 'playwright-test-coverage';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
  simulateDrawPath,
} from '../utils/index';
import { rightArmBoneContour } from './utils/constants';
import pause from '../utils/pause';

// Common setup for test
test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stacklabelmapsegmentation');
});

// Test for sphere brush tool
test('Stack Segmentation - Sphere Brush Tool', async ({
  page,
  browserName,
}) => {
  await page.getByRole('combobox').first().selectOption('SphereBrush');

  const canvas = await page.locator('canvas').first();

  await simulateDrawPath(page, canvas, rightArmBoneContour, {
    interpolateSteps: true,
    closePath: true,
  });

  const secondViewport = await page.locator('canvas').nth(1);

  await page.evaluate(() => {
    // Access cornerstone directly from the window object
    const cornerstone = window.cornerstone;
    if (!cornerstone) {
      return;
    }

    const enabledElements = cornerstone.getEnabledElements();
    if (enabledElements.length === 0) {
      return;
    }

    const viewport = enabledElements[1].viewport;
    if (viewport) {
      viewport.setImageIdIndex(1);
      viewport.render();
    }
  });

  await page.waitForTimeout(1000);

  await checkForScreenshot(
    page,
    secondViewport,
    screenShotPaths.stackSegmentation.sphereBrush
  );
});
