import { test } from 'playwright-test-coverage';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'fov');
});

test.describe('Field of View (FOV)', async () => {
  test('should display the correct FOV for each viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });


    await checkForScreenshot(
      page,
      page,
      screenShotPaths.fov.fovIsCorrect
    );
  });
});
