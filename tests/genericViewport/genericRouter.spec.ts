import { expect, test, type Browser, type Page } from '@playwright/test';
import { createExampleUrl, waitForRenderSettled } from '../utils/index';
import {
  countContentPixels,
  countPixelsDifferingBy,
  readViewportPixels,
  type ViewportPixels,
} from '../utils/viewportPixels';

const EXAMPLE = 'genericSliceFirst';
const ENGINE_ID = 'myRenderingEngine';
const CORONAL_VIEWPORT_ID = 'FUSION_CORONAL';
/** The coronal fusion viewport is the third viewport of the example. */
const CORONAL_VIEWPORT_INDEX = 2;
const CT_DATA_ID = 'slice-first:ct';
const PT_DATA_ID = 'slice-first:pt';
const CT_VOLUME_ID = 'cornerstoneStreamingImageVolume:SLICE_FIRST_CT';
const PT_VOLUME_ID = 'cornerstoneStreamingImageVolume:SLICE_FIRST_PT';
const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';
const PROBE_VERSION = 2;
const MAX_3D_TEXTURE_SIZE = 0x8073;
/** The slab of every case: a maximum intensity slab of 10 mm. */
const SLAB_THICKNESS = 10;
/**
 * The tolerance of `genericSliceFirstSlab.spec.ts` for a layer drawn by the
 * sampled path against the GPU volume path: at most 1 percent of the pixels
 * may differ by more than 8 grey levels, at the edges of a field of view.
 */
const PIXEL_TOLERANCE = 8;
const MAX_DIFFERING_FRACTION = 0.01;
const MIN_CONTENT_FRACTION = 0.05;
const LOAD_TIMEOUT_MS = 180000;
const SWITCH_TIMEOUT_MS = 30000;

type PlanLayer = {
  dataId: string;
  role: string;
  slice: string;
  draw: string;
  renderMode: string;
  reason: string;
};

type PlanEvent = {
  dataId: string;
  previous?: PlanLayer;
  current: PlanLayer;
  reason: string;
};

type TestWindow = typeof window & {
  cornerstone: {
    getRenderingEngine: (id: string) => {
      getViewport: (viewportId: string) =>
        | {
            getActors: () => unknown[];
            getRenderPlan: () => PlanLayer[];
            setDisplaySetPresentation: (
              dataId: string,
              props: { slabThickness?: number; blendMode?: number }
            ) => void;
            render: () => void;
          }
        | undefined;
    };
    getRenderingCapabilities: () => Record<string, unknown> & {
      renderer: string;
    };
    cache: {
      getVolume: (volumeId: string) =>
        | {
            loadStatus?: { loaded?: boolean };
            dimensions: number[];
            textureSets: unknown[];
          }
        | undefined;
    };
    eventTarget: EventTarget;
    setRenderBackend: (backend: string) => void;
    Enums: {
      BlendModes: Record<string, number>;
      Events: Record<string, string>;
    };
  };
  routerPlanEvents?: PlanEvent[];
  routerTexStorage3D?: { failWidth?: number; calls: number[] };
  routerContexts?: WebGL2RenderingContext[];
};

/**
 * Opens the example with slice first on and waits until both volumes have
 * loaded, the coronal viewport draws the CT and the PT, and the render plan
 * changes of that viewport are recorded.
 */
async function openExample(page: Page): Promise<void> {
  const url = createExampleUrl(EXAMPLE + '.html');

  url.searchParams.set('sliceFirst', '1');
  url.searchParams.set('debug', 'false');

  await page.goto(url.toString());
  await page.waitForSelector('.slice-first-viewport canvas', {
    timeout: 30000,
  });
  await page.waitForFunction(
    ({ engineId, viewportId, volumeIds }) => {
      const { cornerstone } = window as TestWindow;
      const viewport = cornerstone
        ?.getRenderingEngine(engineId)
        ?.getViewport(viewportId);

      return (
        (viewport?.getRenderPlan().length ?? 0) >= 2 &&
        volumeIds.every(
          (volumeId) =>
            cornerstone.cache.getVolume(volumeId)?.loadStatus?.loaded === true
        )
      );
    },
    {
      engineId: ENGINE_ID,
      viewportId: CORONAL_VIEWPORT_ID,
      volumeIds: [CT_VOLUME_ID, PT_VOLUME_ID],
    },
    { timeout: LOAD_TIMEOUT_MS }
  );
  await page.evaluate((viewportId) => {
    const testWindow = window as TestWindow;
    const { cornerstone } = testWindow;

    testWindow.routerPlanEvents = [];
    cornerstone.eventTarget.addEventListener(
      cornerstone.Enums.Events.RENDER_PLAN_CHANGED,
      (evt) => {
        const detail = (evt as CustomEvent).detail;

        if (detail.viewportId === viewportId) {
          testWindow.routerPlanEvents.push(detail);
        }
      }
    );
  }, CORONAL_VIEWPORT_ID);
  await waitForRenderSettled(page, { quietMs: 800, timeout: 30000 });
}

/** The render plan of the coronal viewport. */
function getPlan(page: Page): Promise<PlanLayer[]> {
  return page.evaluate(
    ({ engineId, viewportId }) =>
      (window as TestWindow).cornerstone
        .getRenderingEngine(engineId)
        .getViewport(viewportId)
        .getRenderPlan(),
    { engineId: ENGINE_ID, viewportId: CORONAL_VIEWPORT_ID }
  );
}

/** The slice, the draw, the render mode and the reason of the CT and the PT. */
async function getPlanSummary(page: Page): Promise<string[][]> {
  const plan = await getPlan(page);

  return [CT_DATA_ID, PT_DATA_ID].map((dataId) => {
    const layer = plan.find((entry) => entry.dataId === dataId);

    return layer
      ? [layer.slice, layer.draw, layer.renderMode, layer.reason]
      : ['missing'];
  });
}

/** Waits until the plan of the CT and the PT is the given one. */
async function expectPlan(
  page: Page,
  ct: string[],
  pt: string[]
): Promise<void> {
  await expect
    .poll(() => getPlanSummary(page), { timeout: SWITCH_TIMEOUT_MS })
    .toEqual([ct, pt]);
}

/** The recorded plan changes of the coronal viewport since the last call. */
function takePlanEvents(page: Page): Promise<PlanEvent[]> {
  return page.evaluate(() => {
    const testWindow = window as TestWindow;
    const events = testWindow.routerPlanEvents;

    testWindow.routerPlanEvents = [];

    return events;
  });
}

/**
 * Sets a maximum intensity slab of `slabThickness` on both layers of the
 * coronal viewport, or no slab for 0, as the slab controls of the example do.
 */
async function setCoronalSlab(
  page: Page,
  slabThickness: number
): Promise<void> {
  await page.evaluate(
    ({ engineId, viewportId, dataIds, slabThickness }) => {
      const { cornerstone } = window as TestWindow;
      const viewport = cornerstone
        .getRenderingEngine(engineId)
        .getViewport(viewportId);
      const { BlendModes } = cornerstone.Enums;

      for (const dataId of dataIds) {
        viewport.setDisplaySetPresentation(dataId, {
          slabThickness,
          blendMode: slabThickness
            ? BlendModes.MAXIMUM_INTENSITY_BLEND
            : BlendModes.COMPOSITE,
        });
      }

      viewport.render();
    },
    {
      engineId: ENGINE_ID,
      viewportId: CORONAL_VIEWPORT_ID,
      dataIds: [CT_DATA_ID, PT_DATA_ID],
      slabThickness,
    }
  );
}

/**
 * Waits until no layer of the coronal viewport waits for its picture: a slab
 * sampled in steps is pending as a loading picture is (`qualityPending`).
 */
async function waitForFinalPictures(page: Page): Promise<void> {
  await page.waitForFunction(
    ({ engineId, viewportId }) => {
      const viewport = (window as TestWindow).cornerstone
        .getRenderingEngine(engineId)
        .getViewport(viewportId) as unknown as {
        getDebugBindings: () => Array<{
          rendering: {
            refreshFidelity?: () => void;
            qualityPending?: boolean;
          };
        }>;
      };

      return viewport.getDebugBindings().every(({ rendering }) => {
        rendering.refreshFidelity?.();

        return !rendering.qualityPending;
      });
    },
    { engineId: ENGINE_ID, viewportId: CORONAL_VIEWPORT_ID },
    { timeout: SWITCH_TIMEOUT_MS, polling: 100 }
  );
}

async function readCoronal(page: Page): Promise<ViewportPixels> {
  await waitForFinalPictures(page);
  await waitForRenderSettled(page, { quietMs: 800, timeout: 30000 });

  return readViewportPixels(page, CORONAL_VIEWPORT_INDEX, { stableMs: 500 });
}

/** The number of 3D texture sets that a volume holds now. */
function getTextureSetCount(page: Page, volumeId: string): Promise<number> {
  return page.evaluate(
    (id) =>
      (window as TestWindow).cornerstone.cache.getVolume(id)?.textureSets
        ?.length ?? 0,
    volumeId
  );
}

/**
 * Checks that a picture shows content and matches the GPU slab of a healthy
 * page within the tolerance of the slab spec.
 */
function expectHealthyPicture(
  healthy: ViewportPixels,
  picture: ViewportPixels,
  label: string
): void {
  const total = picture.width * picture.height;
  const differing = countPixelsDifferingBy(healthy, picture, PIXEL_TOLERANCE);

  console.log(
    `${label}: ${differing} of ${total} pixels differ by more than ${PIXEL_TOLERANCE} grey levels`
  );
  expect(picture.width, `${label}: canvas width`).toBe(healthy.width);
  expect(picture.height, `${label}: canvas height`).toBe(healthy.height);
  expect(
    countContentPixels(picture),
    `${label}: pixels that are not background`
  ).toBeGreaterThanOrEqual(total * MIN_CONTENT_FRACTION);
  expect(
    differing,
    `${label}: pixels that differ from the reference`
  ).toBeLessThanOrEqual(total * MAX_DIFFERING_FRACTION);
}

let healthyPicture: ViewportPixels | undefined;

/**
 * The coronal picture of the slab on a healthy page, where both layers are
 * drawn by the GPU volume path. It is read once per worker.
 */
async function getHealthyPicture(browser: Browser): Promise<ViewportPixels> {
  if (healthyPicture) {
    return healthyPicture;
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await openExample(page);
    await setCoronalSlab(page, SLAB_THICKNESS);
    await expectPlan(
      page,
      ['gpuVolume', 'gpu', 'vtkVolumeSlice', 'slab'],
      ['gpuVolume', 'gpu', 'vtkVolumeSlice', 'slab']
    );
    healthyPicture = await readCoronal(page);
  } finally {
    await context.close();
  }

  return healthyPicture;
}

/**
 * Turns the slab off and on again, and checks that the moved layer stays on
 * the CPU slab with its reason and never mounts the GPU volume path again.
 */
async function expectStaysDown(
  page: Page,
  movedDataId: string,
  ct: string[],
  pt: string[]
): Promise<void> {
  await takePlanEvents(page);

  for (const slabThickness of [0, SLAB_THICKNESS, 0, SLAB_THICKNESS]) {
    await setCoronalSlab(page, slabThickness);
    await waitForRenderSettled(page, { quietMs: 500, timeout: 30000 });
  }

  await expectPlan(page, ct, pt);

  const events = await takePlanEvents(page);

  expect(
    events
      .filter((event) => event.dataId === movedDataId)
      .map((event) => event.current.renderMode),
    `${movedDataId}: render modes during a second slab on and off`
  ).not.toContain('vtkVolumeSlice');
}

test.describe('Router: a layer leaves the GPU volume path when its 3D texture cannot work', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(420000);

  test('a float layer on a device without float linear filtering', async ({
    page,
    browser,
  }) => {
    const healthy = await getHealthyPicture(browser);

    await openExample(page);

    const capabilities = await page.evaluate(() =>
      (window as TestWindow).cornerstone.getRenderingCapabilities()
    );

    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, value),
      {
        key: STORAGE_KEY,
        value: JSON.stringify({
          probeVersion: PROBE_VERSION,
          renderer: capabilities.renderer,
          formats: {
            norm16: capabilities.norm16,
            norm16Linear: capabilities.norm16Linear,
            float: capabilities.float,
            floatLinear: false,
            halfFloat: capabilities.halfFloat,
            halfFloatLinear: capabilities.halfFloatLinear,
          },
        }),
      }
    );

    const ctFloat = !(capabilities.norm16 && capabilities.norm16Linear);
    const ctPlan = ctFloat
      ? ['cpu', 'gpu', 'vtkSampledSlice', 'floatFilter']
      : ['gpuVolume', 'gpu', 'vtkVolumeSlice', 'slab'];
    const ptPlan = ['cpu', 'gpu', 'vtkSampledSlice', 'floatFilter'];

    console.log(
      `the CT 3D texture is ${ctFloat ? 'R32F (no norm16 here)' : 'norm16'}, so the CT ${ctFloat ? 'moves too' : 'stays on the GPU'}`
    );

    try {
      await openExample(page);

      expect(
        await page.evaluate(
          () =>
            (window as TestWindow).cornerstone.getRenderingCapabilities()
              .floatLinear
        )
      ).toBe(false);
      await expectPlan(
        page,
        ['cpu', 'gpu', 'vtkSampledSlice', 'slice'],
        ['cpu', 'gpu', 'vtkSampledSlice', 'slice']
      );
      await takePlanEvents(page);
      await setCoronalSlab(page, SLAB_THICKNESS);
      await expectPlan(page, ctPlan, ptPlan);

      const events = await takePlanEvents(page);

      expect(
        events.map((event) => [event.dataId, event.reason]).sort()
      ).toEqual([
        [CT_DATA_ID, ctPlan[3]],
        [PT_DATA_ID, 'floatFilter'],
      ]);
      expectHealthyPicture(
        healthy,
        await readCoronal(page),
        'float PT on the CPU slab'
      );
      await expectStaysDown(page, PT_DATA_ID, ctPlan, ptPlan);
      expect(await getTextureSetCount(page, PT_VOLUME_ID)).toBe(0);
    } finally {
      await page.evaluate(
        (key) => window.localStorage.removeItem(key),
        STORAGE_KEY
      );
    }
  });

  test('a 3D texture larger than the device allows', async ({
    page,
    browser,
  }) => {
    const healthy = await getHealthyPicture(browser);

    await page.addInitScript((parameter) => {
      const getParameter = WebGL2RenderingContext.prototype.getParameter;

      WebGL2RenderingContext.prototype.getParameter = function (name) {
        return name === parameter ? 256 : getParameter.call(this, name);
      };
    }, MAX_3D_TEXTURE_SIZE);
    await openExample(page);

    expect(
      await page.evaluate(
        () =>
          (window as TestWindow).cornerstone.getRenderingCapabilities()
            .max3DTextureSize
      )
    ).toBe(256);

    await setCoronalSlab(page, SLAB_THICKNESS);
    await expectPlan(
      page,
      ['cpu', 'gpu', 'vtkSampledSlice', 'textureSize'],
      ['gpuVolume', 'gpu', 'vtkVolumeSlice', 'slab']
    );

    const events = await takePlanEvents(page);

    expect(
      events
        .filter((event) => event.previous)
        .map((event) => [event.dataId, event.reason])
        .sort()
    ).toEqual([
      [CT_DATA_ID, 'textureSize'],
      [PT_DATA_ID, 'slab'],
    ]);
    expectHealthyPicture(
      healthy,
      await readCoronal(page),
      'CT larger than the largest 3D texture on the CPU slab'
    );
    await expectStaysDown(
      page,
      CT_DATA_ID,
      ['cpu', 'gpu', 'vtkSampledSlice', 'textureSize'],
      ['gpuVolume', 'gpu', 'vtkVolumeSlice', 'slab']
    );
    expect(await getTextureSetCount(page, CT_VOLUME_ID)).toBe(0);
  });

  test('a 3D texture that fails', async ({ page, browser }) => {
    const healthy = await getHealthyPicture(browser);

    await page.addInitScript(() => {
      const testWindow = window as TestWindow;
      const texStorage3D = WebGL2RenderingContext.prototype.texStorage3D;

      testWindow.routerTexStorage3D = { calls: [] };
      WebGL2RenderingContext.prototype.texStorage3D = function (
        target,
        levels,
        internalFormat,
        width,
        height,
        depth
      ) {
        const state = testWindow.routerTexStorage3D;

        state.calls.push(width);

        if (state.failWidth === width) {
          state.failWidth = undefined;

          return texStorage3D.call(
            this,
            target,
            levels,
            internalFormat,
            0,
            0,
            0
          );
        }

        return texStorage3D.call(
          this,
          target,
          levels,
          internalFormat,
          width,
          height,
          depth
        );
      };
    });
    await openExample(page);

    const ctWidth = await page.evaluate((volumeId) => {
      const testWindow = window as TestWindow;
      const width =
        testWindow.cornerstone.cache.getVolume(volumeId).dimensions[0];

      testWindow.routerTexStorage3D.failWidth = width;

      return width;
    }, CT_VOLUME_ID);

    await takePlanEvents(page);
    await setCoronalSlab(page, SLAB_THICKNESS);
    await expectPlan(
      page,
      ['cpu', 'gpu', 'vtkSampledSlice', 'textureFailed'],
      ['gpuVolume', 'gpu', 'vtkVolumeSlice', 'slab']
    );

    const events = await takePlanEvents(page);

    expect(
      events
        .filter((event) => event.reason === 'textureFailed')
        .map((event) => [event.dataId, event.previous?.renderMode])
    ).toEqual([[CT_DATA_ID, 'vtkVolumeSlice']]);
    expect(events.filter((event) => event.dataId === PT_DATA_ID).length).toBe(
      1
    );
    expectHealthyPicture(
      healthy,
      await readCoronal(page),
      'CT whose 3D texture failed on the CPU slab'
    );

    const callsBefore = await page.evaluate(
      (width) =>
        (window as TestWindow).routerTexStorage3D.calls.filter(
          (call) => call === width
        ).length,
      ctWidth
    );

    await expectStaysDown(
      page,
      CT_DATA_ID,
      ['cpu', 'gpu', 'vtkSampledSlice', 'textureFailed'],
      ['gpuVolume', 'gpu', 'vtkVolumeSlice', 'slab']
    );
    expect(
      await page.evaluate(
        (width) =>
          (window as TestWindow).routerTexStorage3D.calls.filter(
            (call) => call === width
          ).length,
        ctWidth
      ),
      'allocations of a CT texture after the failure'
    ).toBe(callsBefore);
  });

  test('a lost WebGL context that comes back, and one that does not', async ({
    page,
    browser,
  }) => {
    const healthy = await getHealthyPicture(browser);
    const gpuPlan = ['gpuVolume', 'gpu', 'vtkVolumeSlice', 'slab'];
    const cpuPlan = ['cpu', 'cpu', 'cpuVolume', 'contextLost'];

    await page.addInitScript(() => {
      const testWindow = window as TestWindow;
      const getContext = HTMLCanvasElement.prototype.getContext;

      testWindow.routerContexts = [];
      HTMLCanvasElement.prototype.getContext = function (
        type: string,
        ...args: unknown[]
      ) {
        const context = getContext.call(this, type, ...args);

        if (type === 'webgl2' && context) {
          testWindow.routerContexts.push(context as WebGL2RenderingContext);
        }

        return context;
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await openExample(page);
    await setCoronalSlab(page, SLAB_THICKNESS);
    await expectPlan(page, gpuPlan, gpuPlan);
    expectHealthyPicture(healthy, await readCoronal(page), 'before a loss');

    const loseContexts = (restoreAfterMs?: number) =>
      page.evaluate((restoreAfter) => {
        const extensions = (window as TestWindow).routerContexts
          .filter((context) => !context.isContextLost())
          .map((context) => context.getExtension('WEBGL_lose_context'))
          .filter(Boolean);

        extensions.forEach((extension) => {
          extension.loseContext();

          if (restoreAfter !== undefined) {
            setTimeout(() => extension.restoreContext(), restoreAfter);
          }
        });

        return extensions.length;
      }, restoreAfterMs);

    await takePlanEvents(page);
    expect(await loseContexts(300)).toBeGreaterThan(0);
    await page.waitForTimeout(3000);
    await expectPlan(page, gpuPlan, gpuPlan);
    expect(await takePlanEvents(page)).toEqual([]);
    expectHealthyPicture(
      healthy,
      await readCoronal(page),
      'after a context that came back'
    );

    expect(await loseContexts()).toBeGreaterThan(0);
    await expectPlan(page, cpuPlan, cpuPlan);

    const events = await takePlanEvents(page);

    expect(events.map((event) => [event.dataId, event.reason]).sort()).toEqual([
      [CT_DATA_ID, 'contextLost'],
      [PT_DATA_ID, 'contextLost'],
    ]);
    expectHealthyPicture(
      healthy,
      await readCoronal(page),
      'drawn on the CPU after a context that did not come back'
    );
    await expectStaysDown(page, CT_DATA_ID, cpuPlan, cpuPlan);
  });
});
