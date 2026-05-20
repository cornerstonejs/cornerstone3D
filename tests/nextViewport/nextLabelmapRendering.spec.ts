import { expect, test } from '@playwright/test';
import {
  createExampleUrl,
  checkForCanvasSnapshot,
  expectViewportNextRuntime,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'nextLabelmapRendering';
const SETTLE_MS = 5000;
const SEGMENTATION_UID_PREFIX = 'MY_SEGMENTATION_ID-Labelmap-';

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
        type: 'planarNext',
        renderModesByDataId: {
          'labelmap-rendering-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'labelmap-rendering-next:source': 'vtkVolumeSlice',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_CORONAL',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
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
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRenderingNext.axial,
      0
    );
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRenderingNext.coronal,
      1
    );
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRenderingNext.sagittal,
      2
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
        type: 'planarNext',
        renderModesByDataId: {
          'labelmap-rendering-next:source': 'cpuVolume',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_SAGITTAL',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          'labelmap-rendering-next:source': 'cpuVolume',
        },
      },
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_CORONAL',
        constructorName: 'PlanarViewport',
        type: 'planarNext',
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
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRenderingNext.cpuAxial,
      0
    );
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRenderingNext.cpuCoronal,
      1
    );
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapRenderingNext.cpuSagittal,
      2
    );
  });
});
