import { expect } from '@playwright/test';

const checkForScreenshot = async (locator, screenshotPath) => {
  try {
    await expect(locator).toHaveScreenshot(screenshotPath, {
      maxDiffPixelRatio: 0.1,
    });
    return true;
  } catch (error) {
    throw new Error('Screenshot does not match.');
  }
};

export { checkForScreenshot };
