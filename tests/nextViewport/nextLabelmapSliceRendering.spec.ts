import { test, expect } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  getVisibleViewportCanvas,
  getSegmentationActorClassNames,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'nextLabelmapSliceRendering';
const SETTLE_MS = 5000;
const SEGMENTATION_ID = 'MY_SEGMENTATION_ID';

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
    await page.waitForSelector('div#content');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SETTLE_MS);
  };
}

test.describe('Labelmap Slice Rendering - Next (GPU)', () => {
  test.beforeEach(navigateToExample());

  test('should use PlanarViewport GPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_AXIAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-slice-rendering-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-slice-rendering-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_CORONAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-slice-rendering-next:source': 'vtkVolumeSlice',
        },
      },
    ]);
  });

  test('should render labelmap with useSliceRendering in all orientations (next GPU)', async ({
    page,
  }) => {
    const axial = getVisibleViewportCanvas(page, 0);
    const coronal = getVisibleViewportCanvas(page, 1);
    const sagittal = getVisibleViewportCanvas(page, 2);

    await checkForScreenshot(
      page,
      axial,
      screenShotPaths.labelmapSliceRenderingNext.axial
    );
    await checkForScreenshot(
      page,
      coronal,
      screenShotPaths.labelmapSliceRenderingNext.coronal
    );
    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.labelmapSliceRenderingNext.sagittal
    );
  });

  test('should use vtkImageSlice actor for segmentation (next GPU)', async ({
    page,
  }) => {
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
