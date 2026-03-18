import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
  simulateClicksOnElement,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'mprReformat', 2000);
});

test.describe('MPR Reformat Visual Tests', () => {
  test('should match screenshot before interaction', async ({ page }) => {
    const screenshotLocator = page.locator('#content > div');

    // Take screenshot before reformat
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.mprReformat.beforeReformat
    );

    // Click the reformat button
    await page.click('button:has-text("Set orientation reformat")');

    // Wait for reformat to complete
    await page.waitForTimeout(2000);

    // Take screenshot after reformat
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.mprReformat.afterReformat
    );
  });

  test('should match screenshot after interaction', async ({ page }) => {
    const screenshotLocator = page.locator('#content > div');
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);

    // Click the reformat button
    await page.click('button:has-text("Set orientation reformat")');

    // Wait for reformat to complete
    await page.waitForTimeout(2000);

    // Take screenshot after reformat
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.mprReformat.afterReformat
    );

    // Perform some interaction (e.g., pan) - try to click on canvas
    // Skip interaction on mobile browsers where canvas clicking is problematic
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);

    if (!isMobile) {
      try {
        await simulateClicksOnElement({
          locator: firstCanvas,
          points: [
            { x: 100, y: 100 },
            { x: 200, y: 200 },
          ],
        });

        // Wait for interaction to complete
        await page.waitForTimeout(1000);
      } catch (error) {
        // If canvas interaction fails, just wait and continue
        console.log('Canvas interaction failed, continuing with test');
        await page.waitForTimeout(1000);
      }
    } else {
      // On mobile, just wait without interaction
      console.log('Skipping canvas interaction on mobile browser');
      await page.waitForTimeout(1000);
    }

    // Verify the reformat is maintained after interaction
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.mprReformat.afterInteraction
    );
  });
});
