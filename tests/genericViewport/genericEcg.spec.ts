import { expect, test } from '@playwright/test';
import {
  createExampleUrl,
  checkForCanvasSnapshot,
  expectViewportRuntime,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'genericEcg';
const SETTLE_MS = 5000;

/**
 * The share of the 540,000 pixels of the picture that may differ from the
 * baseline on macOS. The lead labels use the font monospace: Courier on
 * macOS, DejaVu Sans Mono on the Linux machine of the baseline and of CI.
 * Measured on macOS with the comparator of this test: the picture differs in
 * 1,693 pixels, all in the rows of the labels; with the first lead hidden it
 * differs in 2,550, with a trace too thin to see in 11,513, without the grid
 * in 37,119, and with twice the sensitivity in 121,724. This budget, 1,836
 * pixels, takes the labels and none of those.
 */
const MACOS_LABEL_FONT_MAX_DIFF_PIXEL_RATIO = 0.0034;

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
    await page.waitForSelector('#cornerstone-element', {
      state: 'visible',
    });
    await page.waitForTimeout(SETTLE_MS);
  };
}

test.describe('ECGViewport', () => {
  test.beforeEach(navigateToExample());

  test('should use ECGViewport runtime', async ({ page }) => {
    await expectViewportRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'ecgGenericViewport',
        constructorName: 'ECGViewport',
        type: 'ecg',
        renderModesByDisplaySetId: {
          'ecg-next:primary': 'signal2d',
        },
      },
    ]);
  });

  test('should render ECG waveform', async ({ page }) => {
    // The ECG viewport draws its lead labels and waveform straight onto the
    // canvas (not the SVG annotation layer), so there is no text node to hide.
    // Two environment-dependent sources remain: glyph rasterization of the
    // labels and anti-aliasing along the steep QRS segments of the trace. Both
    // are sub-pixel and together touch ~0.13% of the frame (measured), so the
    // budget is set to ~2x that to absorb run-to-run variation while staying far
    // below a real regression (a missing lead or wrong scaling moves far more).
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.ecgNext.viewport,
      0,
      {
        maxDiffPixelRatio:
          process.platform === 'darwin'
            ? MACOS_LABEL_FONT_MAX_DIFF_PIXEL_RATIO
            : 0.003,
      }
    );
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
