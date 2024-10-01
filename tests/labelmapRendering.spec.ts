import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'labelmapRendering');
});

test.describe('Labelmap Rendering', async () => {
  test('should render the labelmap in axial orientation', async ({ page }) => {
    const canvas = await page.locator('canvas').nth(0);

    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.labelmapRendering.axial
    );
  });

  test('should render the labelmap in coronal orientation', async ({
    page,
  }) => {
    const canvas = await page.locator('canvas').nth(1);

    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.labelmapRendering.coronal
    );
  });

  test('should render the labelmap in sagittal orientation', async ({
    page,
  }) => {
    const canvas = await page.locator('canvas').nth(2);

    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.labelmapRendering.sagittal
    );
  });
});
