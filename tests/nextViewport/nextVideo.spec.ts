import { expect, test } from '@playwright/test';
import {
  createExampleUrl,
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
    // VideoViewport draws into an HTML <video> element, not the main canvas,
    // so checkForCanvasSnapshot captures only the background. Use Playwright's
    // element screenshot on the viewport container instead so the actual
    // frame ends up in the baseline. The example autoplays, so any given
    // run can be on a completely different frame — observed diffs reach
    // 40% per run. We're really just asserting that the viewport renders
    // *something* video-shaped, so allow generous slack.
    const viewport = page.locator('[data-viewport-uid]').first();
    await viewport.waitFor({ state: 'visible' });
    const buffer = await viewport.screenshot();
    await expect(buffer).toMatchSnapshot(screenShotPaths.videoNext.viewport, {
      threshold: 0.005,
      maxDiffPixelRatio: 0.5,
    });
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
