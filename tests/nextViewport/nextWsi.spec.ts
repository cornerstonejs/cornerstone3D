import { test } from '@playwright/test';
import {
  createExampleUrl,
  checkForScreenshot,
  expectViewportNextRuntime,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'nextWsi';
const SETTLE_MS = 5000;

function navigateToExample(params?: Record<string, string>) {
  return async ({ page }) => {
    const url = createExampleUrl(EXAMPLE + '.html');

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    await page.goto(url.toString());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('div#content');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SETTLE_MS);
  };
}

test.describe('WSI ViewportNext', () => {
  test.beforeEach(navigateToExample());

  test('should use WSIViewport runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'wsiNextViewport',
        constructorName: 'WSIViewport',
        type: 'wholeSlideNext',
        renderModesByDataId: {
          'wsi-next:primary': 'wsi2d',
        },
      },
    ]);
  });

  test('should render WSI data', async ({ page }) => {
    const locator = page.locator('#cornerstone-element');
    await checkForScreenshot(page, locator, screenShotPaths.wsiNext.viewport);
  });
});
