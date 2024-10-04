import { test } from '@playwright/test';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'volumeBasic');
});

test.describe('Basic Volume', async () => {
  test('should display a single DICOM series in a Volume viewport.', async ({
    page,
  }) => {
    // Set up the event listener to wait for the volume load event
    const eventComplete = page.evaluate(() => {
      return new Promise((resolve) => {
        const cornerstone = window.cornerstone;
        const eventTarget = cornerstone.eventTarget;
        const Events = cornerstone.Enums.Events;
        eventTarget.addEventListener(
          Events.IMAGE_VOLUME_LOADING_COMPLETED,
          () => {
            resolve();
          }
        );
      });
    });

    // Wait for the event to complete
    await eventComplete;

    // Now take the screenshot
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.volumeBasic.viewport
    );
  });
});
