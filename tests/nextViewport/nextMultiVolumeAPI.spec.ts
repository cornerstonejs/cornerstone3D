import { test } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  getVisibleViewportCanvas,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'nextMultiVolumeAPI';
const SETTLE_MS = 8000;

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

function createMultiVolumeTests(mode: string, screenshotPath: string) {
  test(`should render fused multi-volume data (${mode})`, async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(page, locator, screenshotPath);
  });
}

test.describe('Multi Volume API Next (GPU)', () => {
  test.beforeEach(navigateToExample());

  test('should use PlanarViewport GPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL_STACK_NEXT',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'multi-volume-api-next:ct': 'vtkVolumeSlice',
          'multi-volume-api-next:pt': 'vtkVolumeSlice',
        },
      },
    ]);
  });

  createMultiVolumeTests('GPU', screenShotPaths.multiVolumeAPINext.viewport);
});

test.describe('Multi Volume API Next (CPU)', () => {
  test.beforeEach(navigateToExample({ cpu: 'true' }));

  test('should use PlanarViewport CPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL_STACK_NEXT',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'multi-volume-api-next:ct': 'cpuVolume',
          'multi-volume-api-next:pt': 'cpuVolume',
        },
      },
    ]);
  });

  createMultiVolumeTests(
    'CPU',
    screenShotPaths.multiVolumeAPINext.cpuViewport
  );
});
