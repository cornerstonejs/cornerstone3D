import { expect, test, type Page } from '@playwright/test';
import {
  createExampleUrl,
  expectGenericViewportRuntime,
} from '../utils/index';

const PROJECTION_EXAMPLE = 'viewportProjection';
const PROJECTION_SYNC_EXAMPLE = 'viewportProjectionSynchronizer';

const PROJECTION_ENGINE_ID = 'viewportProjectionRenderingEngine';
const PLANAR_VIEWPORT_ID = 'PROJECTION_PLANAR_NEXT';
const VOLUME_VIEWPORT_ID = 'PROJECTION_VOLUME_3D_NEXT';
const PLANAR_DATA_ID = 'viewport-projection:planar';
const VOLUME_DATA_ID = 'viewport-projection:volume3d';

const SYNC_ENGINE_ID = 'viewportProjectionSynchronizerRenderingEngine';
const LEFT_VIEWPORT_ID = 'PROJECTION_SYNC_LEFT';
const RIGHT_VIEWPORT_ID = 'PROJECTION_SYNC_RIGHT';
const LEFT_DATA_ID = 'viewport-projection-sync:left';
const RIGHT_DATA_ID = 'viewport-projection-sync:right';

type ProjectionPresentation = {
  pan?: [number, number];
  rotation?: number;
  zoom?: number;
};

const projectionSelector = {
  pan: true,
  rotation: true,
  zoom: true,
};

async function navigateToExample(page: Page, exampleName: string) {
  await page.goto(createExampleUrl(`${exampleName}.html`).toString());
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('div#content');
  await page.waitForLoadState('networkidle');
}

function infoLocator(page: Page, viewportId: string) {
  return page.locator(`#${viewportId}-projection-info`);
}

async function waitForProjectionInfo(page: Page, viewportId: string) {
  const info = infoLocator(page, viewportId);

  await expect(info).toBeVisible();
  await expect(info).toContainText('adapter:');

  return info;
}

async function clickProjectionButton(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
}

async function getPresentation(
  page: Page,
  renderingEngineId: string,
  viewportId: string
): Promise<ProjectionPresentation | undefined> {
  return page.evaluate(
    ({ renderingEngineId, selector, viewportId }) => {
      const cornerstone = (window as any).cornerstone;
      const viewport =
        cornerstone
          ?.getRenderingEngine?.(renderingEngineId)
          ?.getViewport?.(viewportId);

      return viewport
        ? cornerstone?.viewportProjection?.getPresentation(viewport, {
            selector,
          })
        : undefined;
    },
    {
      renderingEngineId,
      selector: projectionSelector,
      viewportId,
    }
  );
}

async function patchPresentation(
  page: Page,
  renderingEngineId: string,
  viewportId: string,
  presentation: ProjectionPresentation
) {
  await page.evaluate(
    ({ presentation, renderingEngineId, viewportId }) => {
      const cornerstone = (window as any).cornerstone;
      const viewport =
        cornerstone
          ?.getRenderingEngine?.(renderingEngineId)
          ?.getViewport?.(viewportId);
      const nextViewState =
        viewport &&
        cornerstone?.viewportProjection?.withPresentation(
          viewport,
          presentation
        );

      if (viewport && nextViewState) {
        viewport.setViewState(nextViewState);
        viewport.render();
      }
    },
    {
      presentation,
      renderingEngineId,
      viewportId,
    }
  );
}

/**
 * Exercises the projection and canvas/world conversion path that drag tools
 * call repeatedly, while keeping the assertion broad enough for CI variance.
 */
async function runPlanarProjectionWorkload(page: Page) {
  return page.evaluate(
    ({ renderingEngineId, selector, viewportId }) => {
      const cornerstone = (window as any).cornerstone;
      const viewport =
        cornerstone
          ?.getRenderingEngine?.(renderingEngineId)
          ?.getViewport?.(viewportId);
      const projectionService = cornerstone?.viewportProjection;

      if (!viewport || !projectionService) {
        return undefined;
      }

      const iterations = 180;
      const start = performance.now();
      let canvasPoint: number[] | undefined;
      let presentation: ProjectionPresentation | undefined;

      for (let index = 0; index < iterations; index++) {
        const canvasA = [160 + (index % 40), 180 + (index % 30)];
        const canvasB = [canvasA[0] + 2, canvasA[1] - 2];
        const worldA = viewport.canvasToWorld(canvasA);

        viewport.canvasToWorld(canvasB);
        canvasPoint = viewport.worldToCanvas(worldA);
        presentation = projectionService.getPresentation(viewport, {
          selector,
        });

        projectionService.withPresentation(viewport, {
          pan: [
            (presentation?.pan?.[0] ?? 0) + 0.01,
            (presentation?.pan?.[1] ?? 0) - 0.01,
          ],
          rotation: presentation?.rotation,
          zoom: presentation?.zoom,
        });
      }

      return {
        canvasPoint,
        durationMs: performance.now() - start,
        iterations,
        presentation,
      };
    },
    {
      renderingEngineId: PROJECTION_ENGINE_ID,
      selector: projectionSelector,
      viewportId: PLANAR_VIEWPORT_ID,
    }
  );
}

function expectPresentationsClose(
  actual: ProjectionPresentation | undefined,
  expected: ProjectionPresentation | undefined
) {
  expect(actual).toBeDefined();
  expect(expected).toBeDefined();
  expect(actual?.zoom).toBeCloseTo(expected?.zoom ?? 0, 2);
  expect(actual?.rotation).toBeCloseTo(expected?.rotation ?? 0, 2);
  expect(actual?.pan?.[0]).toBeCloseTo(expected?.pan?.[0] ?? 0, 2);
  expect(actual?.pan?.[1]).toBeCloseTo(expected?.pan?.[1] ?? 0, 2);
}

test.describe('Viewport Projection Service example', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await navigateToExample(page, PROJECTION_EXAMPLE);
    await waitForProjectionInfo(page, PLANAR_VIEWPORT_ID);
    await waitForProjectionInfo(page, VOLUME_VIEWPORT_ID);
  });

  test('uses Planar Next and Volume 3D Next projection adapters', async ({
    page,
  }) => {
    await expectGenericViewportRuntime(page, [
      {
        renderingEngineId: PROJECTION_ENGINE_ID,
        viewportId: PLANAR_VIEWPORT_ID,
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          [PLANAR_DATA_ID]: 'vtkImage',
        },
      },
      {
        renderingEngineId: PROJECTION_ENGINE_ID,
        viewportId: VOLUME_VIEWPORT_ID,
        constructorName: 'VolumeViewport3DV2',
        type: 'volume3dNext',
        renderModesByDataId: {
          [VOLUME_DATA_ID]: 'vtkVolume3d',
        },
      },
    ]);
  });

  test('patches Planar, zooms 3D, and refreshes snapshots', async ({
    page,
  }) => {
    await clickProjectionButton(page, 'Patch Planar Projection');
    await expect(infoLocator(page, PLANAR_VIEWPORT_ID)).toContainText(
      'lastAction: patch planar projection'
    );
    await expect(infoLocator(page, PLANAR_VIEWPORT_ID)).toContainText(
      'rotation: 25.00'
    );

    await clickProjectionButton(page, 'Zoom 3D Projection');
    await expect(infoLocator(page, VOLUME_VIEWPORT_ID)).toContainText(
      'lastAction: zoom 3d projection'
    );

    await clickProjectionButton(page, 'Refresh Snapshots');
    await expect(infoLocator(page, PLANAR_VIEWPORT_ID)).toContainText(
      'lastAction: manual snapshot refresh'
    );
    await expect(infoLocator(page, VOLUME_VIEWPORT_ID)).toContainText(
      'lastAction: manual snapshot refresh'
    );
  });

  test('updates projection diagnostics under CPU throttling', async ({
    browserName,
    page,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'CPU throttling is only available through Chromium CDP.'
    );

    const client = await page.context().newCDPSession(page);
    try {
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      await clickProjectionButton(page, 'Patch Planar Projection');
      await clickProjectionButton(page, 'Zoom 3D Projection');
      await clickProjectionButton(page, 'Refresh Snapshots');

      await expect(infoLocator(page, PLANAR_VIEWPORT_ID)).toContainText(
        'lastAction: manual snapshot refresh'
      );
      await expect(infoLocator(page, VOLUME_VIEWPORT_ID)).toContainText(
        'lastAction: manual snapshot refresh'
      );
    } finally {
      await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
  });

  test('keeps projection canvas conversions responsive under CPU throttling', async ({
    browserName,
    page,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'CPU throttling is only available through Chromium CDP.'
    );

    const client = await page.context().newCDPSession(page);
    try {
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      const result = await runPlanarProjectionWorkload(page);

      expect(result).toBeDefined();
      expect(result?.iterations).toBe(180);
      expect(result?.durationMs).toBeLessThan(10000);
      expect(result?.canvasPoint?.[0]).toBeGreaterThan(0);
      expect(result?.presentation?.zoom).toBeGreaterThan(0);
    } finally {
      await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
  });
});

test.describe('Viewport Projection Synchronizer example', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await navigateToExample(page, PROJECTION_SYNC_EXAMPLE);
    await waitForProjectionInfo(page, LEFT_VIEWPORT_ID);
    await waitForProjectionInfo(page, RIGHT_VIEWPORT_ID);
  });

  test('uses Planar Next projection adapters for both viewports', async ({
    page,
  }) => {
    await expectGenericViewportRuntime(page, [
      {
        renderingEngineId: SYNC_ENGINE_ID,
        viewportId: LEFT_VIEWPORT_ID,
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          [LEFT_DATA_ID]: 'vtkImage',
        },
      },
      {
        renderingEngineId: SYNC_ENGINE_ID,
        viewportId: RIGHT_VIEWPORT_ID,
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          [RIGHT_DATA_ID]: 'vtkImage',
        },
      },
    ]);
  });

  test('copies presentation left-to-right, right-to-left, and respects off mode', async ({
    page,
  }) => {
    const initialLeft = await getPresentation(
      page,
      SYNC_ENGINE_ID,
      LEFT_VIEWPORT_ID
    );
    const initialRight = await getPresentation(
      page,
      SYNC_ENGINE_ID,
      RIGHT_VIEWPORT_ID
    );

    expect(initialRight?.zoom).not.toBeCloseTo(initialLeft?.zoom ?? 0, 2);

    await clickProjectionButton(page, 'Copy Projection Once');

    const copiedRight = await getPresentation(
      page,
      SYNC_ENGINE_ID,
      RIGHT_VIEWPORT_ID
    );
    expectPresentationsClose(copiedRight, initialLeft);

    await patchPresentation(page, SYNC_ENGINE_ID, RIGHT_VIEWPORT_ID, {
      pan: [28, -16],
      rotation: 18,
      zoom: 1.4,
    });
    await page
      .locator('#demo-toolbar select')
      .selectOption({ label: 'right to left' });

    const rightToLeftSource = await getPresentation(
      page,
      SYNC_ENGINE_ID,
      RIGHT_VIEWPORT_ID
    );
    const rightToLeftTarget = await getPresentation(
      page,
      SYNC_ENGINE_ID,
      LEFT_VIEWPORT_ID
    );
    expectPresentationsClose(rightToLeftTarget, rightToLeftSource);

    await page.locator('#demo-toolbar select').selectOption({ label: 'off' });
    await patchPresentation(page, SYNC_ENGINE_ID, LEFT_VIEWPORT_ID, {
      pan: [-40, 22],
      rotation: 7,
      zoom: 1.8,
    });
    await clickProjectionButton(page, 'Copy Projection Once');

    const offModeRight = await getPresentation(
      page,
      SYNC_ENGINE_ID,
      RIGHT_VIEWPORT_ID
    );
    expectPresentationsClose(offModeRight, rightToLeftSource);
  });
});
