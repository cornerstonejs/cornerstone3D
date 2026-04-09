import { test } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  getVisibleViewportCanvas,
  screenShotPaths,
  simulateDrawPath,
} from '../utils/index';

const EXAMPLE = 'nextLabelmapOverlapPlayground';
const SETTLE_MS = 10000;
const TOOL_GROUP_ID = 'LABELMAP_OVERLAP_PLAYGROUND_TOOLGROUP';

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
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SETTLE_MS);
  };
}

async function paintOverlapOnStack(page) {
  const canvas = getVisibleViewportCanvas(page, 0);

  await simulateDrawPath(
    page,
    canvas,
    [
      [175, 160],
      [240, 165],
      [250, 245],
      [180, 255],
    ],
    {
      interpolateSteps: true,
    }
  );

  await page.waitForTimeout(1200);

  await page.getByRole('combobox').nth(1).selectOption('2');
  await page.getByRole('button', { name: 'Allow Overlap' }).click();

  await simulateDrawPath(
    page,
    canvas,
    [
      [205, 175],
      [285, 185],
      [280, 265],
      [205, 250],
    ],
    {
      interpolateSteps: true,
    }
  );

  await page.waitForTimeout(1500);
}

async function disableActivePrimaryTool(page) {
  await page.evaluate((toolGroupId) => {
    const toolGroup = (window as typeof window & {
      cornerstoneTools?: {
        ToolGroupManager?: {
          getToolGroup?: (id: string) => {
            getActivePrimaryMouseButtonTool?: () => string | undefined;
            setToolDisabled?: (toolName: string) => void;
          } | null;
        };
      };
    }).cornerstoneTools?.ToolGroupManager?.getToolGroup?.(toolGroupId);

    const activeToolName = toolGroup?.getActivePrimaryMouseButtonTool?.();

    if (activeToolName) {
      toolGroup?.setToolDisabled?.(activeToolName);
    }
  }, TOOL_GROUP_ID);

  await page.waitForTimeout(300);
}

test.describe('Labelmap Overlap Playground - Next', () => {
  test.beforeEach(navigateToExample({ labelmapImageMapper: '1' }));

  test('should use PlanarViewport runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'labelmapOverlapPlaygroundRenderingEngine',
        viewportId: 'OVERLAP_STACK',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-overlap-next:stack': 'vtkImage',
        },
      },
      {
        renderingEngineId: 'labelmapOverlapPlaygroundRenderingEngine',
        viewportId: 'OVERLAP_AXIAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-overlap-next:volume': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'labelmapOverlapPlaygroundRenderingEngine',
        viewportId: 'OVERLAP_SAGITTAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-overlap-next:volume': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'labelmapOverlapPlaygroundRenderingEngine',
        viewportId: 'OVERLAP_CORONAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-overlap-next:volume': 'vtkVolumeSlice',
        },
      },
    ]);
  });

  test('should render overlapping labelmaps on stack and orthographic views', async ({
    page,
  }) => {
    await paintOverlapOnStack(page);
    await disableActivePrimaryTool(page);

    const locator = page.locator('#content > div');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.labelmapOverlapNext.viewport
    );
  });
});

test.describe('Labelmap Overlap Playground - Next (CPU)', () => {
  test.beforeEach(
    navigateToExample({ labelmapImageMapper: '1', cpu: 'true' })
  );

  test('should use PlanarViewport CPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'labelmapOverlapPlaygroundRenderingEngine',
        viewportId: 'OVERLAP_STACK',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-overlap-next:stack': 'cpu2d',
        },
      },
      {
        renderingEngineId: 'labelmapOverlapPlaygroundRenderingEngine',
        viewportId: 'OVERLAP_AXIAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-overlap-next:volume': 'cpuVolume',
        },
      },
      {
        renderingEngineId: 'labelmapOverlapPlaygroundRenderingEngine',
        viewportId: 'OVERLAP_SAGITTAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-overlap-next:volume': 'cpuVolume',
        },
      },
      {
        renderingEngineId: 'labelmapOverlapPlaygroundRenderingEngine',
        viewportId: 'OVERLAP_CORONAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-overlap-next:volume': 'cpuVolume',
        },
      },
    ]);
  });
});
