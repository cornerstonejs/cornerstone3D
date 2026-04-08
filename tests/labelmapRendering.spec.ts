import { test } from 'playwright-test-coverage';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
  getVisibleViewportCanvas,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'labelmapRendering', 0, false, false);
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
      screenShotPaths.labelmapRendering.axial
    );

    await checkForScreenshot(
      page,
      coronal,
      screenShotPaths.labelmapRendering.coronal
    );

    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.labelmapRendering.sagittal
    );
  });
});
