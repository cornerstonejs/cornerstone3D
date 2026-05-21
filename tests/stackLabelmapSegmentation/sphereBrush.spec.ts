import { test } from 'playwright-test-coverage';
import {
  checkForCanvasSnapshot,
  visitExample,
  screenShotPaths,
  simulateDrawPath,
  getVisibleViewportCanvas,
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

  const canvas = getVisibleViewportCanvas(page, 0);

  await simulateDrawPath(page, canvas, rightArmBoneContour, {
    interpolateSteps: true,
    closePath: true,
  });

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

  await page.waitForTimeout(1500);

  await checkForCanvasSnapshot(
    page,
    '',
    screenShotPaths.stackSegmentation.sphereBrush,
    1,
    { threshold: 0.01 }
  );
});
