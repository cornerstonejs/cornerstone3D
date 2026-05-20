import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForCanvasSnapshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page, context }) => {
  await context.addInitScript(() => (window.IS_PLAYWRIGHT = true));
  await visitExample(page, 'contextPoolRenderingEngine');
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) {
    return;
  }

  await page.evaluate(() => {
    const cornerstone = (
      window as unknown as {
        cornerstone?: {
          getRenderingEngines?: () => Array<{ destroy?: () => void }>;
        };
      }
    ).cornerstone;

    cornerstone
      ?.getRenderingEngines?.()
      ?.forEach((renderingEngine) => renderingEngine.destroy?.());
  });
});

test.describe('Context Pool Rendering Engine', async () => {
  test('should display context pool rendering engine example', async ({
    page,
  }) => {
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.contextPoolRenderingEngine.viewport,
      0
    );
  });
});
