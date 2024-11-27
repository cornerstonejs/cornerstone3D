import { test } from '@playwright/test';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackAPI');
});

test.describe('Stack Viewport API', async () => {
  test('should set VOI range correctly', async ({ page }) => {
    await page.getByRole('button', { name: 'Set VOI Range' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackAPI.setVoiRange
    );
  });
  test('should move to next image', async ({ page }) => {
    await page.getByRole('button', { name: 'Next Image' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(page, locator, screenShotPaths.stackAPI.nextImage);
  });
  test('should move to previous image', async ({ page }) => {
    await page.getByRole('button', { name: 'Next Image' }).click();
    await page.getByRole('button', { name: 'Previous Image' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackAPI.previousImage
    );
  });
  test('should flip horizontally ', async ({ page }) => {
    await page.getByRole('button', { name: 'Flip H' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(page, locator, screenShotPaths.stackAPI.flipH);
  });
  test('should flip vertically ', async ({ page }) => {
    await page.getByRole('button', { name: 'Flip V' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(page, locator, screenShotPaths.stackAPI.flipV);
  });
  test('should rotate absolute 150 degrees', async ({ page }) => {
    await page.getByRole('button', { name: 'Rotate Absolute 150' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackAPI.rotateAbsolute150
    );
  });
  test('should rotate delta 30 degrees', async ({ page }) => {
    await page.getByRole('button', { name: 'Rotate Delta 30' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackAPI.rotateDelta30
    );
  });
  test('should invert', async ({ page }) => {
    await page.getByRole('button', { name: 'Invert' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(page, locator, screenShotPaths.stackAPI.invert);
  });
  test('should apply colormap', async ({ page }) => {
    await page.getByRole('button', { name: 'Apply Colormap' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(page, locator, screenShotPaths.stackAPI.colormap);
  });

  test('should reset', async ({ page }) => {
    await page
      .getByRole('button', { name: 'Apply Random Zoom And Pan' })
      .click();
    await page.getByRole('button', { name: 'Rotate Random' }).click();
    await page.getByRole('button', { name: 'Reset Viewport' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackAPI.resetViewport
    );
  });
});
