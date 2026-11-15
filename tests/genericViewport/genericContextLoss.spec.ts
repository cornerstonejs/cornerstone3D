import { expect, test, type Page } from '@playwright/test';
import { createExampleUrl, waitForRenderSettled } from '../utils/index';
import {
  compareViewportPixels,
  countContentPixels,
  readViewportPixels,
  type ViewportPixels,
} from '../utils/viewportPixels';

const ENGINE_ID = 'myRenderingEngine';
const STACK_EXAMPLE = 'genericStackAPI';
const STACK_VIEWPORT_IDS = ['CT_STACK_GENERIC'];
const VOLUME_EXAMPLE = 'genericVolumeAnnotationTools';
const VOLUME_VIEWPORT_IDS = ['CT_AXIAL_STACK', 'CT_SAGITTAL_STACK'];
const VOLUME_ID = 'cornerstoneStreamingImageVolume:CT_VOLUME_ID';
const MAX_GREY_DIFFERENCE = 1;
/** The part of a canvas that must be content, not background. */
const MIN_CONTENT_FRACTION = 0.05;
const LOSS_COUNT = 2;
const LOAD_TIMEOUT_MS = 90000;
const EVENT_TIMEOUT_MS = 15000;
/**
 * How long the contexts stay lost. A restore asked for in the same task as
 * the lost event is refused by the browser, and the engine is asked to render
 * in this time to check that a lost context draws nothing and throws nothing.
 */
const LOSS_HOLD_MS = 500;

type TestOffscreenWindow = {
  getOpenGLRenderWindow: () => {
    getContext: () => WebGL2RenderingContext | null;
  };
};

type TestEngineInternals = {
  contextPool?: { getAllContexts: () => TestOffscreenWindow[] };
  offscreenMultiRenderWindow?: TestOffscreenWindow;
};

type TestEngine = TestEngineInternals & {
  render: () => void;
  getViewport: (viewportId: string) =>
    | {
        element: HTMLElement;
        getActors: () => Array<{
          referencedId?: string;
          actorMapper?: { renderMode?: string };
        }>;
      }
    | undefined;
  _implementation?: TestEngineInternals;
};

type TestWindow = typeof window & {
  cornerstone: {
    getRenderingEngine: (id: string) => TestEngine | undefined;
    eventTarget: EventTarget;
    Enums: { Events: Record<string, string> };
    cache: {
      getVolume: (
        volumeId: string
      ) => { loadStatus?: { loaded?: boolean } } | undefined;
    };
  };
};

type LossResult = {
  contexts: number;
  lostEvents: number;
  restoredEvents: number;
  rendersWhileLost: number;
  renderedViewports: string[];
};

/**
 * Loses and restores, with `WEBGL_lose_context`, the WebGL context of every
 * offscreen canvas of the rendering engine that holds one, and waits until
 * cornerstone fired its lost and restored events and every given viewport
 * fired `IMAGE_RENDERED` after the restore. While the contexts are lost it
 * asks the engine to render and counts the `IMAGE_RENDERED` events.
 *
 * The offscreen render windows are internals of the rendering engine: the
 * context pool of the default engine, or the single window of the tiled
 * engine. `getRenderingEngine` returns the engine itself, and a
 * `RenderingEngine` wrapper keeps it in `_implementation`. A window that never
 * drew holds no context and is left alone.
 */
function loseAndRestoreEngineContexts(
  page: Page,
  viewportIds: string[]
): Promise<LossResult> {
  return page.evaluate(
    async ({ engineId, viewportIds, timeoutMs, holdMs }) => {
      const { cornerstone } = window as TestWindow;
      const { Events } = cornerstone.Enums;
      const engine = cornerstone.getRenderingEngine(engineId);
      const implementation = engine?._implementation ?? engine;
      const windows = implementation?.contextPool
        ? implementation.contextPool.getAllContexts()
        : [implementation?.offscreenMultiRenderWindow];
      const contexts = windows
        .map((offscreen) => offscreen?.getOpenGLRenderWindow().getContext())
        .filter((gl): gl is WebGL2RenderingContext => !!gl);

      if (!contexts.length) {
        throw new Error('the rendering engine holds no WebGL context');
      }

      const counts = { lost: 0, restored: 0 };
      const onLost = () => counts.lost++;
      const onRestored = () => counts.restored++;
      const withTimeout = <T>(promise: Promise<T>, what: string) =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`timed out: ${what}`)), timeoutMs)
          ),
        ]);
      const waitForCanvasEvent = (gl: WebGL2RenderingContext, type: string) =>
        withTimeout(
          new Promise<void>((resolve) =>
            gl.canvas.addEventListener(type, () => resolve(), { once: true })
          ),
          type
        );

      cornerstone.eventTarget.addEventListener(
        Events.WEBGL_CONTEXT_LOST,
        onLost
      );
      cornerstone.eventTarget.addEventListener(
        Events.WEBGL_CONTEXT_RESTORED,
        onRestored
      );

      const extensions = contexts.map((gl) =>
        gl.getExtension('WEBGL_lose_context')
      );
      const lost = contexts.map((gl) =>
        waitForCanvasEvent(gl, 'webglcontextlost')
      );

      extensions.forEach((extension) => extension.loseContext());
      await Promise.all(lost);

      const elements = viewportIds.map(
        (viewportId) => engine.getViewport(viewportId).element
      );
      let rendersWhileLost = 0;
      const countRender = () => rendersWhileLost++;

      elements.forEach((element) =>
        element.addEventListener(Events.IMAGE_RENDERED, countRender)
      );
      engine.render();
      await new Promise((resolve) => setTimeout(resolve, holdMs));
      elements.forEach((element) =>
        element.removeEventListener(Events.IMAGE_RENDERED, countRender)
      );

      const renderedViewports: string[] = [];
      const rendered = viewportIds.map((viewportId) =>
        withTimeout(
          new Promise<void>((resolve) => {
            const element = engine.getViewport(viewportId).element;

            element.addEventListener(
              Events.IMAGE_RENDERED,
              () => {
                renderedViewports.push(viewportId);
                resolve();
              },
              { once: true }
            );
          }),
          `IMAGE_RENDERED of ${viewportId}`
        )
      );
      const restored = contexts.map((gl) =>
        waitForCanvasEvent(gl, 'webglcontextrestored')
      );

      extensions.forEach((extension) => extension.restoreContext());
      await Promise.all(restored);
      await Promise.all(rendered);

      cornerstone.eventTarget.removeEventListener(
        Events.WEBGL_CONTEXT_LOST,
        onLost
      );
      cornerstone.eventTarget.removeEventListener(
        Events.WEBGL_CONTEXT_RESTORED,
        onRestored
      );

      return {
        contexts: contexts.length,
        lostEvents: counts.lost,
        restoredEvents: counts.restored,
        rendersWhileLost,
        renderedViewports,
      };
    },
    {
      engineId: ENGINE_ID,
      viewportIds,
      timeoutMs: EVENT_TIMEOUT_MS,
      holdMs: LOSS_HOLD_MS,
    }
  );
}

/**
 * Returns the render mode of the source actor of every given viewport: the
 * actor of the volume when the viewport shows it, else the first actor.
 */
function getRenderModes(page: Page, viewportIds: string[]): Promise<string[]> {
  return page.evaluate(
    ({ engineId, viewportIds, volumeId }) => {
      const engine = (window as TestWindow).cornerstone.getRenderingEngine(
        engineId
      );

      return viewportIds.map((viewportId) => {
        const actors = engine?.getViewport(viewportId)?.getActors() ?? [];
        const source =
          actors.find((entry) => entry.referencedId === volumeId) ?? actors[0];

        return source?.actorMapper?.renderMode ?? 'missing';
      });
    },
    { engineId: ENGINE_ID, viewportIds, volumeId: VOLUME_ID }
  );
}

/** Opens an example and waits until it rendered with the given render mode. */
async function openExample(
  page: Page,
  example: string,
  viewportIds: string[],
  renderMode: string,
  params: Record<string, string> = {}
): Promise<void> {
  const url = createExampleUrl(example + '.html');

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  await page.goto(url.toString());
  await page.waitForSelector('#content canvas:visible', { timeout: 30000 });

  if (example === VOLUME_EXAMPLE) {
    await page.waitForFunction(
      (volumeId) =>
        (window as TestWindow).cornerstone?.cache?.getVolume(volumeId)
          ?.loadStatus?.loaded === true,
      VOLUME_ID,
      { timeout: LOAD_TIMEOUT_MS }
    );
  }

  await expect
    .poll(() => getRenderModes(page, viewportIds), { timeout: 30000 })
    .toEqual(viewportIds.map(() => renderMode));
  await waitForRenderSettled(page, { quietMs: 500, timeout: 30000 });
}

/** Reads the pictures of the first `count` viewports of the page. */
async function readPictures(
  page: Page,
  count: number
): Promise<ViewportPixels[]> {
  const pictures: ViewportPixels[] = [];

  for (let index = 0; index < count; index++) {
    pictures.push(await readViewportPixels(page, index));
  }

  return pictures;
}

/** Checks that a picture shows content, so two blank canvases do not compare equal. */
function expectContent(picture: ViewportPixels, name: string): void {
  expect(
    countContentPixels(picture),
    `${name}: pixels that are not background, of ${picture.width * picture.height}`
  ).toBeGreaterThanOrEqual(
    picture.width * picture.height * MIN_CONTENT_FRACTION
  );
}

/**
 * Reads the pictures, loses and restores every context of the engine
 * `LOSS_COUNT` times, and checks after each restore that every viewport drew
 * again and shows the first picture, and that the page threw nothing.
 */
async function expectPictureBackAfterContextLoss(
  page: Page,
  viewportIds: string[],
  label: string
): Promise<void> {
  const pageErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));

  const before = await readPictures(page, viewportIds.length);

  before.forEach((picture, index) =>
    expectContent(picture, `${label}, ${viewportIds[index]} before the loss`)
  );

  for (let loss = 1; loss <= LOSS_COUNT; loss++) {
    const result = await loseAndRestoreEngineContexts(page, viewportIds);

    expect(result.contexts, `${label}: contexts lost`).toBeGreaterThan(0);
    expect(result.lostEvents, `${label}: lost events`).toBe(result.contexts);
    expect(result.restoredEvents, `${label}: restored events`).toBe(
      result.contexts
    );
    expect(result.rendersWhileLost, `${label}: renders while lost`).toBe(0);
    expect([...result.renderedViewports].sort()).toEqual(
      [...viewportIds].sort()
    );

    await waitForRenderSettled(page, { quietMs: 500, timeout: 30000 });

    const after = await readPictures(page, viewportIds.length);

    after.forEach((picture, index) => {
      const name = `${label}, ${viewportIds[index]} after loss ${loss}`;
      const difference = compareViewportPixels(before[index], picture);

      expectContent(picture, name);
      expect(difference.sameSize, `${name}: canvas size`).toBe(true);
      expect(
        difference.maxDifference,
        `${name}: largest difference (${difference.differingPixels} pixels differ)`
      ).toBeLessThanOrEqual(MAX_GREY_DIFFERENCE);
    });
  }

  expect(pageErrors, `${label}: page errors`).toEqual([]);
}

test.describe('WebGL context loss', () => {
  test.setTimeout(240000);

  test('the stack image path draws its picture again after a restore', async ({
    page,
  }) => {
    await openExample(page, STACK_EXAMPLE, STACK_VIEWPORT_IDS, 'vtkImage');

    await expectPictureBackAfterContextLoss(
      page,
      STACK_VIEWPORT_IDS,
      'stack image'
    );
  });

  test('the sampled slice path draws its picture again after a restore', async ({
    page,
  }) => {
    await openExample(
      page,
      VOLUME_EXAMPLE,
      VOLUME_VIEWPORT_IDS,
      'vtkSampledSlice',
      { sliceFirst: '1' }
    );

    await expectPictureBackAfterContextLoss(
      page,
      VOLUME_VIEWPORT_IDS,
      'sampled slice'
    );
  });

  test('the GPU volume slice path refills its texture after a restore', async ({
    page,
  }) => {
    await openExample(
      page,
      VOLUME_EXAMPLE,
      VOLUME_VIEWPORT_IDS,
      'vtkVolumeSlice',
      { sliceFirst: '0' }
    );

    await expectPictureBackAfterContextLoss(
      page,
      VOLUME_VIEWPORT_IDS,
      'GPU volume slice'
    );
  });
});
