import { expect, test } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  getVisibleViewportCanvas,
  screenShotPaths,
} from './utils/index';

const EXAMPLE = 'nextLabelmapRendering';
const SETTLE_MS = 5000;
const SEGMENTATION_UID_PREFIX = 'MY_SEGMENTATION_ID-Labelmap-';

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

async function expectMountedLabelmapActors(page) {
  const actorState = await page.evaluate(() => {
    const engine = (window as typeof window & {
      cornerstone?: {
        getRenderingEngine?: (id: string) => {
          getViewport?: (viewportId: string) => {
            getActors?: () => Array<{
              representationUID?: string;
              uid?: string;
            }>;
          } | null;
        } | null;
      };
    }).cornerstone?.getRenderingEngine?.('myRenderingEngine');

    return ['CT_AXIAL', 'CT_SAGITTAL', 'CT_CORONAL'].map((viewportId) => {
      const actors = engine?.getViewport?.(viewportId)?.getActors?.() ?? [];

      return {
        viewportId,
        actorCount: actors.length,
        representationUIDs: actors
          .map((actor) => actor.representationUID)
          .filter((value): value is string => !!value),
      };
    });
  });

  actorState.forEach(({ actorCount, representationUIDs, viewportId }) => {
    expect(actorCount, `${viewportId} actor count`).toBeGreaterThan(1);
    expect(
      representationUIDs.some((uid) => uid.startsWith(SEGMENTATION_UID_PREFIX)),
      `${viewportId} labelmap actor`
    ).toBe(true);
  });
}

test.describe('Labelmap Rendering - Next (GPU)', () => {
  test.beforeEach(navigateToExample());

  test('should use PlanarViewport GPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_AXIAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-rendering-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-rendering-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_CORONAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-rendering-next:source': 'vtkVolumeSlice',
        },
      },
    ]);
    await expectMountedLabelmapActors(page);
  });

  test('should render labelmap in all orientations (next GPU)', async ({
    page,
  }) => {
    const axial = getVisibleViewportCanvas(page, 0);
    const coronal = getVisibleViewportCanvas(page, 1);
    const sagittal = getVisibleViewportCanvas(page, 2);

    await checkForScreenshot(
      page,
      axial,
      screenShotPaths.labelmapRenderingNext.axial
    );
    await checkForScreenshot(
      page,
      coronal,
      screenShotPaths.labelmapRenderingNext.coronal
    );
    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.labelmapRenderingNext.sagittal
    );
  });
});

test.describe('Labelmap Rendering - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ cpu: 'true' }));

  test('should use PlanarViewport CPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_AXIAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-rendering-next:source': 'cpuVolume',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-rendering-next:source': 'cpuVolume',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_CORONAL',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'labelmap-rendering-next:source': 'cpuVolume',
        },
      },
    ]);
    await expectMountedLabelmapActors(page);
  });

  test('should render labelmap in all orientations (next CPU)', async ({
    page,
  }) => {
    const axial = getVisibleViewportCanvas(page, 0);
    const coronal = getVisibleViewportCanvas(page, 1);
    const sagittal = getVisibleViewportCanvas(page, 2);

    await checkForScreenshot(
      page,
      axial,
      screenShotPaths.labelmapRenderingNext.cpuAxial
    );
    await checkForScreenshot(
      page,
      coronal,
      screenShotPaths.labelmapRenderingNext.cpuCoronal
    );
    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.labelmapRenderingNext.cpuSagittal
    );
  });
});
