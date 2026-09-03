import { test } from 'playwright-test-coverage';
import {
  checkForCanvasSnapshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page, context }) => {
  await visitExample(page, 'contourRendering');
  await context.addInitScript(() => (window.IS_TILED = true));
});

test.describe('Contour Rendering', async () => {
  test('should add a contour as a segmentation to a volume viewport', async ({
    page,
  }) => {
    await checkForCanvasSnapshot(
      page,
      'canvas.cornerstone-canvas',
      screenShotPaths.contourRenderingTiled.viewport
    );
  });
});
