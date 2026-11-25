import { expect, test } from '@playwright/test';
import {
  createExampleUrl,
  expectGenericViewportRuntime,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'genericWsi';
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

test.describe('WSI GenericViewport', () => {
  test.beforeEach(navigateToExample());

  test('should use WSIViewport runtime', async ({ page }) => {
    await expectGenericViewportRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'wsiGenericViewport',
        constructorName: 'WSIViewport',
        type: 'wholeSlideNext',
        renderModesByDataId: {
          'wsi-next:primary': 'wsi2d',
        },
      },
    ]);
  });

  test('should render WSI data', async ({ page }) => {
    // WSIViewport renders through dicom-microscopy-viewer's tile DOM, not
    // through the main canvas, so checkForCanvasSnapshot captures only the
    // background color. Take an element screenshot of the viewport container
    // so the actual tiles end up in the baseline.
    const viewport = page.locator('[data-viewport-uid]').first();
    await viewport.waitFor({ state: 'visible' });
    const buffer = await viewport.screenshot();
    await expect(buffer).toMatchSnapshot(screenShotPaths.wsiNext.viewport, {
      threshold: 0.005,
      // The dicom-microscopy-viewer scale-bar overlay ("1000 µm") re-rasterizes
      // its glyphs slightly differently across CI environments, plus sub-pixel
      // tile-edge AA — together ~0.0014 of the frame (measured). The budget is
      // set to ~2x that to absorb run-to-run variation while staying tight
      // enough to catch a real overlay/tile regression, and lets the existing
      // baseline keep working without per-environment regeneration.
      maxDiffPixelRatio: 0.003,
    });
  });
});
