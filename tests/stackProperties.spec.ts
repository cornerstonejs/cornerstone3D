import { test } from '@playwright/test';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackProperties');
});

test.describe('Stack Properties', async () => {
  test('should display the next image.', async ({ page }) => {
    await page.getByRole('button', { name: 'Next Image' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackProperties.nextImage
    );
  });

  test('should display the previous image.', async ({ page }) => {
    await page.getByRole('button', { name: 'Next Image' }).click();
    await page.getByRole('button', { name: 'Previous Image' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackProperties.previousImage
    );
  });

  test('should add properties only for the current image.', async ({
    page,
  }) => {
    await page
      .getByRole('button', { name: 'Add Properties only for current imageID' })
      .click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackProperties.propertiesAddedForCurrentImage
    );
    await page.getByRole('button', { name: 'Next Image' }).click();
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackProperties.propertiesAreSameForNextImage
    );
  });

  test('should remove current imageId properties.', async ({ page }) => {
    await page
      .getByRole('button', { name: 'Add Properties only for current imageID' })
      .click();
    await page.getByRole('button', { name: 'Next Image' }).click();
    await page
      .getByRole('button', { name: 'Add Properties only for current imageID' })
      .click();
    await page
      .getByRole('button', { name: 'Remove current imageId Properties' })
      .click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackProperties.propertiesRemovedForCurrentImage
    );
    await page.getByRole('button', { name: 'Previous Image' }).click();
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackProperties.propertiesAreSameForPreviousImage
    );
  });

  test('should reset to default viewport properties.', async ({ page }) => {
    await page
      .getByRole('button', { name: 'Add Properties only for current imageID' })
      .click();
    await page.getByRole('button', { name: 'Reset to metadata' }).click();
    await page
      .getByRole('button', { name: 'Reset to Default Viewport Properties' })
      .click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackProperties.resetToDefaultViewportProperties
    );
  });

  test('should reset to metadata.', async ({ page }) => {
    await page
      .getByRole('button', { name: 'Add Properties only for current imageID' })
      .click();
    await page.getByRole('button', { name: 'Reset to metadata' }).click();
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackProperties.resetMetadata
    );
  });
});
