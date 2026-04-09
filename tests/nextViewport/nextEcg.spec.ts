import { test } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'nextEcg';
const SETTLE_MS = 5000;

function navigateToExample(params?: Record<string, string>) {
  return async ({ page }) => {
    const url = new URL(`http://localhost:3333/${EXAMPLE}.html`);

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

test.describe('ECG ViewportNext', () => {
  test.beforeEach(navigateToExample());

  test('should use ECGViewportNext runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'ecgNextViewport',
        constructorName: 'ECGViewportNext',
        type: 'ecgV2',
        renderModesByDataId: {
          'ecg-next:primary': 'signal2d',
        },
      },
    ]);
  });

  test('should render ECG waveform', async ({ page }) => {
    const locator = page.locator('#cornerstone-element');
    await checkForScreenshot(page, locator, screenShotPaths.ecgNext.viewport);
  });
});
