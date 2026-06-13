import { test } from 'playwright-test-coverage';
import {
  checkForCanvasSnapshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'contourRendering');
});

test.describe('Contour Rendering', async () => {
  test('should add a contour as a segmentation to a volume viewport', async ({
    page,
  }) => {
    await checkForCanvasSnapshot(
      page,
      'canvas.cornerstone-canvas',
      screenShotPaths.contourRendering.viewport
    );
  });
});
