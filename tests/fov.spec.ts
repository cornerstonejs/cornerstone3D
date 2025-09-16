import { test } from 'playwright-test-coverage';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 850 });
  await visitExample(page, 'fov');
});

test.describe('Field of View (FOV)', async () => {
  test('should display the correct FOV for each viewport', async ({
    page,
  }) => {


    await checkForScreenshot(
      page,
      page,
      screenShotPaths.fov.fovIsCorrect
    );
  });
});
