import { test } from 'playwright-test-coverage';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
  reduceViewportsSize,
  attemptAction,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'labelmapRendering', 0, false, false);
});

test.describe('Labelmap Rendering', async () => {
  test('should render the labelmap in axial/coronal/sagittal orientations', async ({
    page,
  }) => {
    await attemptAction(() => reduceViewportsSize(page), 1000, 10);

    const axial = await page.locator('canvas').nth(0);
    const coronal = await page.locator('canvas').nth(1);
    const sagittal = await page.locator('canvas').nth(2);

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
