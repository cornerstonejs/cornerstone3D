import { test } from '@playwright/test';
import {
  createExampleUrl,
  checkForCanvasSnapshot,
  expectGenericViewportRuntime,
  getVisibleViewportCanvas,
  screenShotPaths,
  simulateDrawPath,
} from '../utils/index';
import { rightArmBoneContour } from '../stackLabelmapSegmentation/utils/constants';

const EXAMPLE = 'genericStackLabelmapSegmentation';
const SETTLE_MS = 10000;

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
    await page.waitForSelector('div#content canvas:visible', {
      state: 'visible',
    });
    await page.waitForTimeout(SETTLE_MS);
  };
}

test.describe.configure({ mode: 'serial' });

// Match the legacy stackLabelmapSegmentation/circularBrush.spec.ts inputs:
// select the CircularBrush dropdown, then draw the rightArmBoneContour with
// path interpolation + closure so the resulting segmentation mask matches
// pixel-for-pixel.
async function paintBrushStroke(page) {
  await page.getByRole('combobox').first().selectOption('CircularBrush');
  const canvas = getVisibleViewportCanvas(page, 0);
  await simulateDrawPath(page, canvas, rightArmBoneContour, {
    interpolateSteps: true,
    closePath: true,
  });
  await page.waitForTimeout(1500);
}

test.describe('Stack Labelmap Segmentation - Next (GPU)', () => {
  test.beforeEach(navigateToExample());

  test('should use PlanarViewport GPU runtime', async ({ page }) => {
    await expectGenericViewportRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'STACK_VIEWPORT',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'stack-labelmap-segmentation-next:ct': 'vtkImage',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'STACK_VIEWPORT_2',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'stack-labelmap-segmentation-next:mg': 'vtkImage',
        },
      },
    ]);
  });

  test('should paint a brush stroke (next GPU)', async ({ page }) => {
    await paintBrushStroke(page);
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.stackLabelmapSegNext.brush,
      0
    );
  });
});

test.describe('Stack Labelmap Segmentation - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ cpu: 'true' }));

  test('should use PlanarViewport CPU runtime', async ({ page }) => {
    await expectGenericViewportRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'STACK_VIEWPORT',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'stack-labelmap-segmentation-next:ct': 'cpuImage',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'STACK_VIEWPORT_2',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'stack-labelmap-segmentation-next:mg': 'cpuImage',
        },
      },
    ]);
  });

  test('should paint a brush stroke (next CPU)', async ({ page }) => {
    await paintBrushStroke(page);
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.stackLabelmapSegNext.cpuBrush,
      0
    );
  });
});
