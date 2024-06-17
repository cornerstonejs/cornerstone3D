import { test } from '@playwright/test';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'ultrasoundColors');
});

test.describe('Ultrasound Colors', async () => {
  test('should render the ultrasound colors correctly', async ({ page }) => {
    const totalSlices = 7;
    let locator = page.locator('.cornerstone-canvas');

    for (let i = 1; i <= totalSlices; i++) {
      await checkForScreenshot(
        page,
        locator,
        screenShotPaths.ultrasoundColors[`slice${i}`]
      );

      if (i < totalSlices) {
        await page.getByRole('button', { name: 'Scroll' }).click();
        locator = page.locator('.cornerstone-canvas');
      }
    }
  });
});
