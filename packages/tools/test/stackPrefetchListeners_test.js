import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { startListenerCounts } from '../../../utils/test/listenerCounts';

const { Enums, cache, eventTarget, imageLoadPoolManager, utilities } =
  cornerstone3D;
const { Events, ViewportType, OrientationAxis } = Enums;
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
