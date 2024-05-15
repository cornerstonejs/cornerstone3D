import { expect } from '@playwright/test';

const checkForScreenshot = async (page, screenshotPath) => {
  try {
    await expect(page.locator('.cornerstone-canvas').nth(8)).toHaveScreenshot(
      screenshotPath,
      { maxDiffPixels: 50 }
    );
    return true;
  } catch (error) {
    return false;
  }
};

export { checkForScreenshot };
