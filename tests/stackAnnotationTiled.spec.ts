import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForCanvasSnapshot,
  screenShotPaths,
  simulateDrag,
} from './utils/index';

test.beforeEach(async ({ page, context }) => {
  await context.addInitScript(() => (window.IS_TILED = true));
  await visitExample(page, 'stackAnnotationTools', 1500);
});

test.describe('Stack Annotation Tools - Tiled', async () => {
  test('should draw a length measurement on the viewport', async ({ page }) => {
    const locator = page.locator('.cornerstone-canvas').nth(0);
    await simulateDrag(page, locator, { steps: 10 });
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.stackAnnotationTiled.lengthTool,
      0,
      // Absorb sub-pixel font drift on the "138 mm" label across CI
      // environments; a missing/mis-drawn annotation differs by far more.
      { maxDiffPixelRatio: 0.003 }
    );
  });
});
