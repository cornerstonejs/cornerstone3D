import { expect, test, type Page } from '@playwright/test';
import {
  createExampleUrl,
  expectGenericViewportRuntime,
  getVisibleViewportCanvas,
} from '../utils/index';

const EXAMPLE = 'genericStackAPI';
const ENGINE_ID = 'myRenderingEngine';
const VIEWPORT_ID = 'CT_STACK_GENERIC';
const DATA_ID = 'stack-api-next:primary';
const SETTLE_MS = 5000;

type CornerstoneWindow = typeof window & {
  cornerstone?: {
    getRenderingEngine?: (id: string) => {
      getViewport?: (viewportId: string) => Record<string, any> | null;
    } | null;
    setRenderBackend?: (backend: string, reason?: string) => void;
    eventTarget?: EventTarget;
  };
  __backendEvents?: unknown[];
};

async function navigateToExample(page: Page) {
  const url = createExampleUrl(EXAMPLE + '.html');

  await page.goto(url.toString());
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('div#content', {
    state: 'visible',
    timeout: 30000,
  });
  await page.waitForSelector('#content canvas:visible', {
    state: 'visible',
    timeout: 30000,
  });
  await page.waitForTimeout(SETTLE_MS);
}

function getViewportState(page: Page) {
  return page.evaluate(
    ({ engineId, viewportId, dataId }) => {
      const win = window as CornerstoneWindow;
      const engine = win.cornerstone?.getRenderingEngine?.(engineId);
      const viewport = engine?.getViewport?.(viewportId);

      return {
        imageIdIndex: viewport?.getCurrentImageIdIndex?.(),
        zoom: viewport?.getZoom?.(),
        pan: viewport?.getPan?.(),
        voiRange: viewport?.getDisplaySetPresentation?.(dataId)?.voiRange,
        renderMode: viewport?.getDisplaySetRenderMode?.(dataId),
      };
    },
    { engineId: ENGINE_ID, viewportId: VIEWPORT_ID, dataId: DATA_ID }
  );
}

function setRenderBackend(page: Page, backend: string) {
  return page.evaluate((value) => {
    (window as CornerstoneWindow).cornerstone?.setRenderBackend?.(
      value,
      'e2e-render-backend-switch'
    );
  }, backend);
}

test.describe('Render backend live switch', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToExample(page);
  });

  test('switches a live viewport GPU -> CPU -> GPU preserving state', async ({
    page,
  }) => {
    await expectGenericViewportRuntime(page, [
      {
        renderingEngineId: ENGINE_ID,
        viewportId: VIEWPORT_ID,
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: { [DATA_ID]: 'vtkImage' },
      },
    ]);

    // Put the viewport into a non-default state: slice 1, custom VOI,
    // random zoom/pan.
    await page.getByRole('button', { name: 'Next Image' }).click();
    await page.getByRole('button', { name: 'Set VOI Range' }).click();
    await page
      .getByRole('button', { name: 'Apply Random Zoom And Pan' })
      .click();
    await page.waitForTimeout(500);

    const before = await getViewportState(page);
    expect(before.renderMode).toBe('vtkImage');
    expect(before.imageIdIndex).toBe(1);

    // Live-switch to the CPU backend; no page reload, same viewport instance.
    await setRenderBackend(page, 'cpu');

    await expect
      .poll(async () => (await getViewportState(page)).renderMode, {
        timeout: 15000,
      })
      .toBe('cpuImage');

    const afterCpu = await getViewportState(page);
    expect(afterCpu.imageIdIndex).toBe(before.imageIdIndex);
    expect(afterCpu.voiRange).toEqual(before.voiRange);
    expect(afterCpu.zoom).toBeCloseTo(before.zoom, 3);
    expect(afterCpu.pan[0]).toBeCloseTo(before.pan[0], 2);
    expect(afterCpu.pan[1]).toBeCloseTo(before.pan[1], 2);

    // The CPU path must actually render and stay interactive: a next-image
    // click changes the visible canvas.
    const canvas = getVisibleViewportCanvas(page);
    const cpuShotBefore = await canvas.screenshot();

    await page.getByRole('button', { name: 'Next Image' }).click();

    await expect
      .poll(async () => (await getViewportState(page)).imageIdIndex)
      .toBe(2);

    const cpuShotAfter = await canvas.screenshot();
    expect(cpuShotBefore.equals(cpuShotAfter)).toBe(false);

    // And back to the GPU: the switch is reversible at runtime.
    await setRenderBackend(page, 'gpu');

    await expect
      .poll(async () => (await getViewportState(page)).renderMode, {
        timeout: 15000,
      })
      .toBe('vtkImage');

    const afterGpu = await getViewportState(page);
    expect(afterGpu.imageIdIndex).toBe(2);
    expect(afterGpu.voiRange).toEqual(before.voiRange);
    expect(afterGpu.zoom).toBeCloseTo(before.zoom, 3);
  });

  test('emits RENDER_BACKEND_CHANGED with previous/current detail', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const win = window as CornerstoneWindow;
      win.__backendEvents = [];
      win.cornerstone?.eventTarget?.addEventListener(
        'CORNERSTONE_RENDER_BACKEND_CHANGED',
        (evt) => {
          win.__backendEvents?.push((evt as CustomEvent).detail);
        }
      );
    });

    await setRenderBackend(page, 'cpu');
    await setRenderBackend(page, 'cpu'); // no-op, must not re-emit
    await setRenderBackend(page, 'auto');

    const events = await page.evaluate(
      () => (window as CornerstoneWindow).__backendEvents
    );

    expect(events).toEqual([
      {
        previous: 'auto',
        current: 'cpu',
        effectiveBackend: 'cpu',
        reason: 'e2e-render-backend-switch',
      },
      {
        previous: 'cpu',
        current: 'auto',
        effectiveBackend: 'gpu',
        reason: 'e2e-render-backend-switch',
      },
    ]);
  });
});
