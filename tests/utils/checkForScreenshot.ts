import { expect } from '@playwright/test';
import type { Locator, Page } from 'playwright';
import { resolveCompatibilityScreenshotPath } from './compatibilityMode';

/**
 * @param page - The page to interact with
 * @param locator - The element to check for screenshot
 * @param screenshotPath - The path to save the screenshot
 * @param attempts - The number of attempts to check for screenshot
 * @param delay - The delay between attempts
 * @returns  True if the screenshot matches, otherwise throws an error
 */
const checkForScreenshot = async (
  page: Page,
  locator: Locator | Page,
  screenshotPath: string,
  attempts = 10,
  delay = 100
) => {
  const resolvedScreenshotPath =
    resolveCompatibilityScreenshotPath(screenshotPath);

  try {
    await page.waitForLoadState('networkidle', {
      timeout: 1000,
    });
  } catch {
    // Some examples keep background requests active long enough that
    // waiting for network idle becomes a source of test hangs.
  }

  if ('waitFor' in locator && typeof locator.waitFor === 'function') {
    await locator.waitFor({
      state: 'visible',
      timeout: 5000,
    });
  }

  for (let i = 0; i < attempts; i++) {
    try {
      await expect(locator).toHaveScreenshot(resolvedScreenshotPath, {
        maxDiffPixelRatio: 0.05,
      });
      return true;
    } catch (error) {
      if (i === attempts - 1) {
        console.debug('Screenshot comparison failed after all attempts');
        throw error; // Throw the original error with details instead of a generic message
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This is a fallback in case the loop exits unexpectedly
  throw new Error(
    'Screenshot comparison failed: loop exited without match or proper error'
  );
};

export { checkForScreenshot };
