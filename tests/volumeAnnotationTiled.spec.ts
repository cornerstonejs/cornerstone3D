import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForCanvasSnapshot,
  screenShotPaths,
  simulateDrag,
  annotationLabelMatches,
  REGISTERED_LENGTH_LABEL,
} from './utils/index';

test.beforeEach(async ({ page, context }) => {
  await context.addInitScript(() => (window.IS_TILED = true));
  await visitExample(page, 'volumeAnnotationTools');
});

test.describe('Volume Annotation Tools - Tiled', async () => {
  test('should draw a length measurement on the viewport', async ({ page }) => {
    const locator = page.locator('.cornerstone-canvas').nth(0);
    await simulateDrag(page, locator, {
      steps: 10,
      // Fail with the reason when the runner drops a mousemove, rather than
      // leaving a half-drawn measurement for the screenshot to report as a
      // few hundred differing pixels.
      verify: annotationLabelMatches(REGISTERED_LENGTH_LABEL),
    });
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.volumeAnnotationTiled.lengthTool,
      0,
      // Absorb sub-pixel font drift on the "138 mm" label across CI
      // environments; a missing/mis-drawn annotation differs by far more.
      { maxDiffPixelRatio: 0.003 }
    );
  });
});
