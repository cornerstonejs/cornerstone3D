import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
  simulateDrag,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackManipulationTools');
});

test.describe('Basic Stack Manipulation', async () => {
  test('should manipulate the window level using the window level tool', async ({
    page,
  }) => {
    await page.getByRole('combobox').selectOption('WindowLevel');
    const locator = page.locator('.cornerstone-canvas');
    await simulateDrag(page, locator);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationTools.windowLevel
    );
  });
  test('should rotate the viewport using the planar rotate tool', async ({
    page,
  }) => {
    await page.getByRole('combobox').selectOption('PlanarRotate');
    const locator = page.locator('.cornerstone-canvas');
    await simulateDrag(page, locator);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationTools.planarRotate
    );
  });
});
