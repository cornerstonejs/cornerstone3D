import { test } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  getVisibleViewportCanvas,
  screenShotPaths,
  simulateDrag,
} from './utils/index';

const EXAMPLE = 'nextStackLabelmapSegmentation';
const SETTLE_MS = 10000;

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
    await page.waitForSelector('div#content canvas:visible', {
      state: 'visible',
    });
    await page.waitForTimeout(SETTLE_MS);
  };
}

test.describe.configure({ mode: 'serial' });

async function paintBrushStroke(page) {
  const canvas = getVisibleViewportCanvas(page);
  await simulateDrag(page, canvas);
  await page.waitForTimeout(1500);
}

test.describe('Stack Labelmap Segmentation - Next (GPU)', () => {
  test.beforeEach(navigateToExample());

  test('should use PlanarViewport GPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'STACK_VIEWPORT',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'stack-labelmap-segmentation-next:ct': 'vtkImage',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'STACK_VIEWPORT_2',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'stack-labelmap-segmentation-next:mg': 'vtkImage',
        },
      },
    ]);
  });

  test('should paint a brush stroke (next GPU)', async ({ page }) => {
    await paintBrushStroke(page);
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackLabelmapSegNext.brush
    );
  });
});

test.describe('Stack Labelmap Segmentation - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ cpu: 'true' }));

  test('should use PlanarViewport CPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'STACK_VIEWPORT',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'stack-labelmap-segmentation-next:ct': 'cpu2d',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'STACK_VIEWPORT_2',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'stack-labelmap-segmentation-next:mg': 'cpu2d',
        },
      },
    ]);
  });

  test('should paint a brush stroke (next CPU)', async ({ page }) => {
    await paintBrushStroke(page);
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackLabelmapSegNext.cpuBrush
    );
  });
});
