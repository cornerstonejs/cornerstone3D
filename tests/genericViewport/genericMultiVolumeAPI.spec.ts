import { test } from '@playwright/test';
import {
  createExampleUrl,
  checkForCanvasSnapshot,
  expectViewportRuntime,
  getPlainVolumeSliceRenderMode,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'genericMultiVolumeAPI';
const SETTLE_MS = 8000;

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

function createMultiVolumeTests(mode: string, screenshotPath: string) {
  test(`should render fused multi-volume data (${mode})`, async ({ page }) => {
    await checkForCanvasSnapshot(page, '', screenshotPath, 0);
  });
}

test.describe('Multi Volume API Next (GPU)', () => {
  test.beforeEach(navigateToExample());

  test('should use PlanarViewport GPU runtime', async ({ page }) => {
    await expectViewportRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL_STACK_GENERIC',
        constructorName: 'PlanarViewport',
        type: 'planar',
        renderModesByDisplaySetId: {
          'multi-volume-api-next:ct': getPlainVolumeSliceRenderMode(),
          'multi-volume-api-next:pt': getPlainVolumeSliceRenderMode(),
        },
      },
    ]);
  });

  createMultiVolumeTests('GPU', screenShotPaths.multiVolumeAPINext.viewport);
});

test.describe('Multi Volume API Next (CPU)', () => {
  test.beforeEach(navigateToExample({ cpu: 'true' }));

  test('should use PlanarViewport CPU runtime', async ({ page }) => {
    await expectViewportRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL_STACK_GENERIC',
        constructorName: 'PlanarViewport',
        type: 'planar',
        renderModesByDisplaySetId: {
          'multi-volume-api-next:ct': 'canvasCpuSlice',
          'multi-volume-api-next:pt': 'canvasCpuSlice',
        },
      },
    ]);
  });

  createMultiVolumeTests(
    'CPU',
    screenShotPaths.multiVolumeAPINext.cpuViewport
  );
});
