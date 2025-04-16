import { test, expect } from 'playwright-test-coverage';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'multipleToolGroups');
});

test.describe('Multiple Tool Groups', async () => {
  test('should set WindowLevel cursor when moving to canvas center', async ({
    page,
  }) => {
    const canvas1 = page.locator('canvas').first();

    await canvas1.waitFor({ state: 'visible' });

    // Get the bounding box and move to center
    const boundingBox = await canvas1.boundingBox();
    await page.mouse.move(
      boundingBox.x + boundingBox.width / 2,
      boundingBox.y + boundingBox.height / 2
    );

    await page.waitForTimeout(100);

    const cursorStyle = await canvas1.evaluate((element) => {
      return window.getComputedStyle(element).cursor;
    });

    // The cursor URL should contain "WindowLevel"
    expect(cursorStyle).toMatch(/url\([^)]*WindowLevel[^)]*\)/);

    // move to second canvas
    const canvas2 = page.locator('canvas').nth(1);
    await canvas2.waitFor({ state: 'visible' });

    const boundingBox2 = await canvas2.boundingBox();
    await page.mouse.move(
      boundingBox2.x + boundingBox2.width / 2,
      boundingBox2.y + boundingBox2.height / 2
    );

    await page.waitForTimeout(100);

    // Get the computed cursor style
    const cursorStyle2 = await canvas2.evaluate((element) => {
      return window.getComputedStyle(element).cursor;
    });

    // The cursor URL should contain "Length"
    expect(cursorStyle2).toMatch(/url\([^)]*Length[^)]*\)/);
  });
});
