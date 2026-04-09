import { expect, test } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  getVisibleViewportCanvas,
  screenShotPaths,
  simulateClicksOnElement,
} from '../utils/index';

const EXAMPLE = 'nextLabelmapSegmentationTools';
const SEGMENTATION_ID = 'MY_SEGMENTATION_ID';
const SETTLE_MS = 10000;

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
    await page.waitForLoadState('networkidle');
    await getVisibleViewportCanvas(page, 0).waitFor({
      state: 'visible',
    });
    await page.waitForTimeout(SETTLE_MS);
  };
}

async function selectSphereBrushAndPaint(page) {
  await page
    .getByRole('combobox')
    .first()
    .selectOption({ label: 'SphereBrush' });

  const firstCanvas = getVisibleViewportCanvas(page, 0);

  await simulateClicksOnElement({
    locator: firstCanvas,
    points: [
      { x: 193, y: 273 },
      { x: 226, y: 274 },
      { x: 195, y: 302 },
      { x: 218, y: 301 },
    ],
  });

  await page.waitForTimeout(1500);
}

async function disableActivePrimaryTool(page) {
  await page.evaluate(() => {
    const toolGroup = (window as typeof window & {
      cornerstoneTools?: {
        ToolGroupManager?: {
          getToolGroup?: (toolGroupId: string) => {
            getActivePrimaryMouseButtonTool?: () => string | undefined;
            setToolDisabled?: (toolName: string) => void;
          } | null;
        };
      };
    }).cornerstoneTools?.ToolGroupManager?.getToolGroup?.('MY_TOOLGROUP_ID');

    const activeToolName = toolGroup?.getActivePrimaryMouseButtonTool?.();

    if (activeToolName) {
      toolGroup?.setToolDisabled?.(activeToolName);
    }
  });

  await page.waitForTimeout(1200);
}

async function waitForRedBrushRendering(page) {
  await page.waitForFunction(
    ({ left, top, width, height }) => {
      const canvas = document.querySelector(
        '.cornerstone-canvas'
      ) as HTMLCanvasElement | null;

      if (!canvas) {
        return false;
      }

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const sampleX = Math.max(0, Math.floor(left * scaleX));
      const sampleY = Math.max(0, Math.floor(top * scaleY));
      const sampleWidth = Math.max(1, Math.floor(width * scaleX));
      const sampleHeight = Math.max(1, Math.floor(height * scaleY));
      const probeCanvas = document.createElement('canvas');

      probeCanvas.width = canvas.width;
      probeCanvas.height = canvas.height;

      const context = probeCanvas.getContext('2d');

      if (!context) {
        return false;
      }

      context.drawImage(canvas, 0, 0, canvas.width, canvas.height);

      const { data } = context.getImageData(
        sampleX,
        sampleY,
        sampleWidth,
        sampleHeight
      );

      let redDominantPixels = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        if (r > g + 10 && r > b + 20) {
          redDominantPixels++;
        }
      }

      return redDominantPixels > 100;
    },
    {
      left: 150,
      top: 220,
      width: 140,
      height: 140,
    },
    {
      timeout: 5000,
    }
  );
}

async function expectPaintedSegmentation(page) {
  const stats = await page.evaluate((segmentationId) => {
    const volume = (window as typeof window & {
      cornerstone?: {
        cache?: {
          getVolume?: (id: string) => {
            voxelManager?: {
              getCompleteScalarDataArray?: () => ArrayLike<number>;
            };
          } | null;
        };
      };
    }).cornerstone?.cache?.getVolume?.(segmentationId);

    const scalarData = volume?.voxelManager?.getCompleteScalarDataArray?.();

    if (!scalarData) {
      return null;
    }

    let nonZero = 0;

    for (let i = 0; i < scalarData.length; i++) {
      if (scalarData[i] !== 0) {
        nonZero++;
      }
    }

    return {
      nonZero,
      total: scalarData.length,
    };
  }, SEGMENTATION_ID);

  expect(stats, 'segmentation volume should be available after painting').not.toBeNull();
  expect(stats?.nonZero ?? 0, 'sphere brush should paint at least one voxel').toBeGreaterThan(0);
}

test.describe('Labelmap Segmentation Tools - Next (GPU)', () => {
  test.beforeEach(navigateToExample());

  test('should use PlanarViewport GPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_AXIAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-segmentation-tools-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-segmentation-tools-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_CORONAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-segmentation-tools-next:source': 'vtkVolumeSlice',
        },
      },
    ]);
  });

  test('should paint with sphere brush (next GPU)', async ({ page }) => {
    await selectSphereBrushAndPaint(page);
    await expectPaintedSegmentation(page);
    await disableActivePrimaryTool(page);
    await waitForRedBrushRendering(page);
    const locator = page.locator('#content > div');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.labelmapSegToolsNext.sphereBrush
    );
  });
});

test.describe('Labelmap Segmentation Tools - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ cpu: 'true' }));

  test('should use PlanarViewport CPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_AXIAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-segmentation-tools-next:source': 'cpuVolume',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-segmentation-tools-next:source': 'cpuVolume',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_CORONAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-segmentation-tools-next:source': 'cpuVolume',
        },
      },
    ]);
  });

  test('should paint with sphere brush (next CPU)', async ({ page }) => {
    await selectSphereBrushAndPaint(page);
    await expectPaintedSegmentation(page);
    await disableActivePrimaryTool(page);
    const locator = page.locator('#content > div');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.labelmapSegToolsNext.cpuSphereBrush
    );
  });
});
