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

    // The OpenLayers scale-bar overlay ("1000 µm") is a DOM label whose glyph
    // rasterization drifts between CI environments — the same root cause as the
    // annotation labels, and the dominant source of diff pixels here. Assert its
    // value explicitly, then mask it out of the screenshot so the pixel
    // comparison only covers the tiles. The value is geometry-derived (fixed
    // initial zoom) and identical across GL backends; accept the micro sign
    // (µ, U+00B5) or Greek mu (μ, U+03BC) since the unit glyph varies.
    const scaleBar = viewport.locator('.ol-scale-line');
    await expect(scaleBar.locator('.ol-scale-line-inner')).toHaveText(
      /^1000\s*[µμ]m$/
    );

    const buffer = await viewport.screenshot({ mask: [scaleBar] });
    await expect(buffer).toMatchSnapshot(screenShotPaths.wsiNext.viewport, {
      threshold: 0.005,
      // Tiles render through a separate GL path; allow a small fraction of
      // sub-pixel edge differences that remain after the scale bar is masked.
      maxDiffPixelRatio: 0.01,
    });
  });
});
