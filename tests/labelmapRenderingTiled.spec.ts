import { test } from 'playwright-test-coverage';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
  getVisibleViewportCanvas,
} from './utils/index';

test.beforeEach(async ({ page, context }) => {
  await visitExample(page, 'labelmapRendering', 0, false, false);
  await context.addInitScript(() => (window.IS_TILED = true));
});

test.describe('Labelmap Rendering', async () => {
  test('should render the labelmap in axial/coronal/sagittal orientations', async ({
    page,
  }) => {
    const axial = getVisibleViewportCanvas(page, 0);
    const coronal = getVisibleViewportCanvas(page, 1);
    const sagittal = getVisibleViewportCanvas(page, 2);

    await checkForScreenshot(
      page,
      axial,
      screenShotPaths.labelmapRenderingTiled.axial
    );

    await checkForScreenshot(
      page,
      coronal,
      screenShotPaths.labelmapRenderingTiled.coronal
    );

    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.labelmapRenderingTiled.sagittal
    );
  });
});
