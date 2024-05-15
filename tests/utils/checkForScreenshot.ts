import { expect } from '@playwright/test';

const checkForScreenshot = async (locator, screenshotPath) => {
  try {
    await expect(locator).toHaveScreenshot(screenshotPath, {
      maxDiffPixels: 50,
    });
    return true;
  } catch (error) {
    return false;
  }
};

export { checkForScreenshot };
