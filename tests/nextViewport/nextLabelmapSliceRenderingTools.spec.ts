import { test, expect } from '@playwright/test';
import {
  createExampleUrl,
  checkForScreenshot,
  expectViewportNextRuntime,
  getVisibleViewportCanvas,
  getSegmentationActorClassNames,
  screenShotPaths,
  simulateClicksOnElement,
} from '../utils/index';

const EXAMPLE = 'nextLabelmapSliceRenderingTools';
const SETTLE_MS = 10000;
const TOOL_GROUP_ID = 'MY_TOOLGROUP_ID';
const SEGMENTATION_ID = 'MY_SEGMENTATION_ID';

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
  await page.evaluate((toolGroupId) => {
    const toolGroup = (
      window as typeof window & {
        cornerstoneTools?: {
          ToolGroupManager?: {
            getToolGroup?: (id: string) => {
              getActivePrimaryMouseButtonTool?: () => string | undefined;
              setToolDisabled?: (toolName: string) => void;
            } | null;
          };
        };
      }
    ).cornerstoneTools?.ToolGroupManager?.getToolGroup?.(toolGroupId);

    const activeToolName = toolGroup?.getActivePrimaryMouseButtonTool?.();

    if (activeToolName) {
      toolGroup?.setToolDisabled?.(activeToolName);
    }
  }, TOOL_GROUP_ID);

  await page.waitForTimeout(300);
}

test.describe('Labelmap Slice Rendering Tools - Next', () => {
  test.beforeEach(navigateToExample());

  test('should use PlanarViewport GPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_AXIAL',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'labelmap-slice-rendering-tools-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'labelmap-slice-rendering-tools-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_CORONAL',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'labelmap-slice-rendering-tools-next:source': 'vtkVolumeSlice',
        },
      },
    ]);
  });

  test('should paint with sphere brush using useSliceRendering', async ({
    page,
  }) => {
    await selectSphereBrushAndPaint(page);
    await disableActivePrimaryTool(page);
    const locator = page.locator('#content > div');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.labelmapSliceRenderingToolsNext.sphereBrush
    );
  });

  test('should use vtkImageSlice actor for segmentation', async ({ page }) => {
    const classNames = await getSegmentationActorClassNames(
      page,
      SEGMENTATION_ID
    );

    expect(classNames.length).toBeGreaterThan(0);
    for (const className of classNames) {
      expect(className).toBe('vtkImageSlice');
    }
  });
});
