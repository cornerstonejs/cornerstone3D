import { expect, test } from '@playwright/test';
import {
  createExampleUrl,
  checkForCanvasSnapshot,
  expectGenericViewportRuntime,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'genericEcg';
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
    await page.waitForSelector('#cornerstone-element', {
      state: 'visible',
    });
    await page.waitForTimeout(SETTLE_MS);
  };
}

test.describe('ECG GenericViewport', () => {
  test.beforeEach(navigateToExample());

  test('should use ECGViewport runtime', async ({ page }) => {
    await expectGenericViewportRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'ecgGenericViewport',
        constructorName: 'ECGViewport',
        type: 'ecgNext',
        renderModesByDataId: {
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
      { maxDiffPixelRatio: 0.003 }
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
