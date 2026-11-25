import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { startListenerCounts } from '../../../utils/test/listenerCounts';
import { getToolState } from '../src/utilities/stackPrefetch/state';

const {
  Enums,
  RenderingEngine,
  cache,
  eventTarget,
  imageLoadPoolManager,
  triggerEvent,
  utilities,
} = cornerstone3D;
const { Events, ViewportType, OrientationAxis, RequestType } = Enums;
const { stackPrefetch, stackContextPrefetch } = csTools3d.utilities;

const renderingEngineId = utilities.uuidv4();

/** Waits for the timers of the prefetch. */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The ids of a stack of 32 by 32 images of the fake image loader. */
function createImageIds(name, count) {
  return Array.from({ length: count }, (_, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name,
      rows: 32,
      columns: 32,
      barStart: 4,
      barWidth: 4,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );
}

/**
 * Shows a stack on a direct next planar viewport that is added to the
 * viewports of the rendering engine.
 */
async function showStack(renderingEngine, viewportId, count = 8) {
  testUtils.createViewports(renderingEngine, {
    viewportType: ViewportType.PLANAR,
    orientation: OrientationAxis.AXIAL,
    viewportId,
    useEnableElement: true,
  });

  const viewport = renderingEngine.getViewport(viewportId);
  const imageIds = createImageIds(viewportId, count);

  await testUtils.setStackOnNextViewport(viewport, imageIds, 0);

  return { viewport, imageIds };
}

/** The image ids of the prefetch requests that wait in the image load pool. */
function queuedPrefetchImageIds(imageIds) {
  return Object.values(
    imageLoadPoolManager.getRequestPool()[RequestType.Prefetch]
  )
    .flat()
    .map(({ additionalDetails }) => additionalDetails?.imageId)
    .filter((imageId) => imageIds.includes(imageId));
}

/**
 * The ways a viewport goes: by `disableElement` on the rendering engine of the
 * test, or with a rendering engine of its own that is destroyed. Each gives
 * the engine to mount on and the function that ends the viewport.
 */
const endings = [
  [
    'disableElement',
    (renderingEngine) => ({
      engine: renderingEngine,
      end: (viewport) => renderingEngine.disableElement(viewport.id),
    }),
  ],
  [
    'a destroyed rendering engine',
    () => {
      const engine = new RenderingEngine(utilities.uuidv4());

      return { engine, end: () => engine.destroy() };
    },
  ],
];

describe('The listeners of the stack prefetch -- ', () => {
  let renderingEngine;
  let counts;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
    counts = startListenerCounts(eventTarget);
  });

  afterEach(function () {
    counts.stop();
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  for (const [name, prefetch] of [
    ['stackContextPrefetch', stackContextPrefetch],
    ['stackPrefetch', stackPrefetch],
  ]) {
    it(`${name}: three enables add one IMAGE_CACHE_IMAGE_REMOVED listener and one disable removes it`, async function () {
      const { viewport } = await showStack(renderingEngine, `${name}Listeners`);
      const before = counts.onEventTarget(Events.IMAGE_CACHE_IMAGE_REMOVED);

      prefetch.enable(viewport.element);
      prefetch.enable(viewport.element);
      prefetch.enable(viewport.element);

      expect(counts.onEventTarget(Events.IMAGE_CACHE_IMAGE_REMOVED)).toBe(
        before + 1
      );
      expect(counts.onElement(viewport.element, Events.NEW_IMAGE)).toBe(1);

      prefetch.disable(viewport.element);

      expect(counts.onEventTarget(Events.IMAGE_CACHE_IMAGE_REMOVED)).toBe(
        before
      );
      expect(counts.onElement(viewport.element, Events.NEW_IMAGE)).toBe(0);
    });

    for (const [ending, startRound] of endings) {
      it(`${name}: five rounds of mount, enable, scroll and ${ending} leave every listener count where it started`, async function () {
        const before = counts.onEventTarget();
        const elements = [];

        for (let round = 0; round < 5; round++) {
          const { engine, end } = startRound(renderingEngine);
          const { viewport } = await showStack(engine, `${name}Rounds`);

          expect(getToolState(viewport.element)).toBeUndefined();

          prefetch.enable(viewport.element);
          await viewport.scroll(2);
          elements.push(viewport.element);
          end(viewport);
        }

        await wait(50);

        expect(counts.onEventTarget()).toEqual(before);
        elements.forEach((element) =>
          expect(counts.onElement(element)).toEqual({})
        );
      });

      it(`${name}: a request that waits in the pool when its viewport goes by ${ending} does not load`, async function () {
        const { engine, end } = startRound(renderingEngine);
        const { viewport, imageIds } = await showStack(engine, `${name}Queued`);
        const maxRequests = imageLoadPoolManager.getMaxSimultaneousRequests(
          RequestType.Prefetch
        );
        const errors = [];
        const onError = (evt) => errors.push(evt.reason ?? evt.error);
        let queued;

        imageLoadPoolManager.setMaxSimultaneousRequests(
          RequestType.Prefetch,
          0
        );

        try {
          prefetch.enable(viewport.element);
          queued = queuedPrefetchImageIds(imageIds);
          end(viewport);
        } finally {
          imageLoadPoolManager.setMaxSimultaneousRequests(
            RequestType.Prefetch,
            maxRequests
          );
        }

        expect(queued.length).toBeGreaterThan(0);
        expect(queuedPrefetchImageIds(imageIds)).toEqual([]);

        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onError);
        imageLoadPoolManager.addRequest(
          () => Promise.resolve(),
          RequestType.Prefetch,
          {},
          0
        );
        await wait(100);
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onError);

        expect(queued.filter((imageId) => cache.isLoaded(imageId))).toEqual([]);
        expect(errors).toEqual([]);
      });
    }

    it(`${name}: a new image on two viewports at once starts the prefetch of both`, async function () {
      const first = await showStack(renderingEngine, `${name}TimerA`, 20);
      const second = await showStack(renderingEngine, `${name}TimerB`, 20);
      const maxRequests = imageLoadPoolManager.getMaxSimultaneousRequests(
        RequestType.Prefetch
      );
      let addRequest;

      imageLoadPoolManager.setMaxSimultaneousRequests(RequestType.Prefetch, 0);

      try {
        prefetch.enable(first.viewport.element);
        prefetch.enable(second.viewport.element);
        addRequest = spyOn(
          imageLoadPoolManager,
          'addRequest'
        ).and.callThrough();

        triggerEvent(first.viewport.element, Events.NEW_IMAGE, {});
        triggerEvent(second.viewport.element, Events.NEW_IMAGE, {});
        await wait(50);

        prefetch.disable(first.viewport.element);
        prefetch.disable(second.viewport.element);
      } finally {
        imageLoadPoolManager.setMaxSimultaneousRequests(
          RequestType.Prefetch,
          maxRequests
        );
      }

      const requested = ({ imageIds }) =>
        addRequest.calls
          .all()
          .some(({ args }) => imageIds.includes(args[2]?.imageId));

      expect(requested(first)).toBe(true);
      expect(requested(second)).toBe(true);
    });
  }

  it('stackContextPrefetch: prefetches the images of each stack with the priority of its own enable', async function () {
    const first = await showStack(renderingEngine, 'prefetchPriorityA', 40);
    const second = await showStack(renderingEngine, 'prefetchPriorityB', 40);

    stackContextPrefetch.enable(first.viewport.element, 5);
    stackContextPrefetch.enable(second.viewport.element, -3);
    await wait(50);
    cache.purgeCache();

    const addRequest = spyOn(
      imageLoadPoolManager,
      'addRequest'
    ).and.callThrough();

    await first.viewport.scroll(25);
    await wait(100);

    const priorities = addRequest.calls
      .all()
      .filter(({ args }) => first.imageIds.includes(args[2]?.imageId))
      .map(({ args }) => args[3]);

    stackContextPrefetch.disable(first.viewport.element);
    stackContextPrefetch.disable(second.viewport.element);

    expect(priorities.length).toBeGreaterThan(0);
    expect(Array.from(new Set(priorities))).toEqual([5]);
  });
});
