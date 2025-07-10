import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page, context }) => {
  await context.addInitScript(() => (window.IS_PLAYWRIGHT = true));
  await visitExample(page, 'sequentialRenderingEngine');
});

test.describe('Sequential Rendering Engine', async () => {
  test('should display sequential rendering engine example', async ({
    page,
  }) => {
    const locator = page.locator('#viewportContainer');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.sequentialRenderingEngine.viewport
    );
  });
});
