import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'labelmapSegmentSpecificConfiguration');
});

test.describe('Labelmap Segment specific Configuration', async () => {
  test('should load the default segmentation (circles)', async ({ page }) => {
    const canvas = await page.locator('canvas');

    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.labelmapSegmentSpecificConfiguration.defaultSegmentation
    );
  });

  test('should change the alpha for Segment 1 to 0%', async ({ page }) => {
    const canvas = await page.locator('canvas');

    await page.locator('input[name="fill alpha for Segment 1"]').fill('0');
    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.labelmapSegmentSpecificConfiguration.segment1Alpha0
    );
  });

  test('should change the alpha for Segment 1 to 50%', async ({ page }) => {
    const canvas = await page.locator('canvas');

    await page.locator('input[name="fill alpha for Segment 1"]').fill('50');
    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.labelmapSegmentSpecificConfiguration.segment1Alpha50
    );
  });

  test('should change the alpha for Segment 2 to 0%', async ({ page }) => {
    const canvas = await page.locator('canvas');

    await page.locator('input[name="fill alpha for Segment 2"]').fill('0');
    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.labelmapSegmentSpecificConfiguration.segment2Alpha0
    );
  });

  test('should change the alpha for Segment 2 to 50%', async ({ page }) => {
    const canvas = await page.locator('canvas');

    await page.locator('input[name="fill alpha for Segment 2"]').fill('50');
    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.labelmapSegmentSpecificConfiguration.segment2Alpha50
    );
  });

  test('should change the alpha for both segments to 25%', async ({ page }) => {
    const canvas = await page.locator('canvas');

    await page.locator('input[name="fill alpha for Segment 1"]').fill('25');
    await page.locator('input[name="fill alpha for Segment 2"]').fill('25');
    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.labelmapSegmentSpecificConfiguration.segmentsAlpha25
    );
  });
});
