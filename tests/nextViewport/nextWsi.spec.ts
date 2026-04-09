import { test } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'nextWsi';
const SETTLE_MS = 5000;

function navigateToExample(params?: Record<string, string>) {
  return async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const link = page.locator(`a:has-text("${EXAMPLE}")`).first();
    const href = await link.getAttribute('href');
    const url = new URL(href, page.url());
    url.pathname = url.pathname.replace(/\.html$/, '');

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    await page.goto(url.toString());
    await page.waitForSelector('div#content');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SETTLE_MS);
  };
}

test.describe('WSI ViewportNext', () => {
  test.beforeEach(navigateToExample());

  test('should use WSIViewportNext runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'wsiNextViewport',
        constructorName: 'WSIViewportNext',
        type: 'wholeSlideV2',
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
