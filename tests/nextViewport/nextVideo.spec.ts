import { expect, test } from '@playwright/test';
import {
  createExampleUrl,
  checkForScreenshot,
  expectViewportNextRuntime,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'nextVideo';
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

test.describe('Video ViewportNext', () => {
  test.beforeEach(navigateToExample());

  test('should use VideoViewport runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'videoNextViewport',
        constructorName: 'VideoViewport',
        type: 'videoNext',
        renderModesByDataId: {
          'video-next:primary': 'video2d',
        },
      },
    ]);
  });

  test('should render video data', async ({ page }) => {
    const locator = page.locator('#cornerstone-element');
    await checkForScreenshot(page, locator, screenShotPaths.videoNext.viewport);
  });

  test('should resize through the rendering engine', async ({ page }) => {
    const result = await page.evaluate(() => {
      const engine =
        window.cornerstone?.getRenderingEngine?.('myRenderingEngine');

      try {
        engine?.resize();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error ? error.message : String(error ?? ''),
        };
      }
    });

    expect(result).toEqual({ ok: true });
  });
});
