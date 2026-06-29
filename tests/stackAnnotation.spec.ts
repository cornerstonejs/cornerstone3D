import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForCanvasSnapshot,
  screenShotPaths,
  simulateDrag,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackAnnotationTools', 1000);
});

test.describe('Stack Annotation Tools', async () => {
  test('should draw a length measurement on the viewport', async ({ page }) => {
    const locator = page.locator('.cornerstone-canvas').nth(0);
    await simulateDrag(page, locator, { steps: 10 });
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.stackAnnotation.lengthTool,
      0,
      // The measurement line/handles are deterministic, but the "138 mm" label
      // re-rasterizes a few sub-pixels differently across CI environments. Allow
      // a small diff ratio to absorb that font drift while still catching a
      // missing/mis-drawn annotation (which differs by far more).
      { maxDiffPixelRatio: 0.003 }
    );
  });
});
