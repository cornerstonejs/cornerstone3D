import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import {
  cache,
  Enums,
  eventTarget,
  imageLoader,
  imageLoadPoolManager,
  RenderingEngine,
  setUseCPURendering,
  triggerEvent,
} from '@cornerstonejs/core';
import stackPrefetch from '../../../src/utilities/stackPrefetch/stackPrefetch';
import stackContextPrefetch from '../../../src/utilities/stackPrefetch/stackContextPrefetch';
import { getToolState } from '../../../src/utilities/stackPrefetch/state';

const { IMAGE_CACHE_IMAGE_REMOVED, STACK_NEW_IMAGE } = Enums.Events;
const makeStack = (name) =>
  Array.from({ length: 10 }, (_, k) => `image:${name}:${k}`);

const cacheImage = (imageId) =>
  cache.putImageSync(imageId, { imageId, sizeInBytes: 8 });
const timesQueued = (element, index) =>
  getToolState(element).indicesToRequest.filter((i) => i === index).length;
const countListeners = () =>
  eventTarget.listeners[IMAGE_CACHE_IMAGE_REMOVED]?.length ?? 0;

let engine;
let addRequest;
// The prefetch state is kept by viewportId, so each viewport needs its own.
let numViewports = 0;

// A real viewport, only the stack it reports is stubbed.
function createViewport(imageIds) {
  const element = document.createElement('div');
  const viewportId = `prefetch-listener-${numViewports++}`;
  engine.enableElement({
    viewportId,
    type: Enums.ViewportType.STACK,
    element,
  });
  const viewport = engine.getViewport(viewportId);
  const getImageIds = jest
    .spyOn(viewport, 'getImageIds')
    .mockReturnValue(imageIds);
  jest.spyOn(viewport, 'getCurrentImageIdIndex').mockReturnValue(0);

  return { element, viewportId, getImageIds };
}

beforeEach(() => {
  setUseCPURendering(true);
  // jsdom has no canvas
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(
      new Proxy({}, { get: () => () => ({ data: new Uint8ClampedArray(4) }) })
    );
  engine = new RenderingEngine('prefetch-listener-engine');
  addRequest = jest
    .spyOn(imageLoadPoolManager, 'addRequest')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  engine.destroy();
  cache.purgeCache();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe.each([
  ['stackPrefetch', stackPrefetch, stackContextPrefetch],
  ['stackContextPrefetch', stackContextPrefetch, stackPrefetch],
])('%s cache listener', (_, prefetch, otherPrefetch) => {
  it('queues a removed image of its stack while enabled', () => {
    const imageIds = makeStack('a');
    const { element } = createViewport(imageIds);
    cacheImage(imageIds[5]);
    cacheImage('image:other-stack:0');
    prefetch.enable(element);
    const queued = [...getToolState(element).indicesToRequest];

    cache.removeImageLoadObject('image:other-stack:0');
    expect(getToolState(element).indicesToRequest).toEqual(queued);

    cache.removeImageLoadObject(imageIds[5]);
    expect(getToolState(element).indicesToRequest).toEqual([...queued, 5]);
    prefetch.disable(element);
  });

  it('ignores an eviction after disable', () => {
    const imageIds = makeStack('a');
    const { element, getImageIds } = createViewport(imageIds);
    cacheImage(imageIds[5]);
    prefetch.enable(element);
    prefetch.disable(element);
    const queued = [...getToolState(element).indicesToRequest];
    getImageIds.mockClear();

    cache.decacheIfNecessaryUntilBytesAvailable(cache.getBytesAvailable() + 1);

    expect(getToolState(element).indicesToRequest).toEqual(queued);
    expect(getImageIds).not.toHaveBeenCalled();
  });

  it('queues once per removal event after repeated enable calls', () => {
    const imageIds = makeStack('a');
    const { element } = createViewport(imageIds);
    cacheImage(imageIds[5]);
    prefetch.enable(element);
    prefetch.enable(element);
    prefetch.enable(element);

    cache.removeImageLoadObject(imageIds[5]);

    expect(timesQueued(element, 5)).toBe(1);
    prefetch.disable(element);
  });

  it('queues a removed image once after disable and enable for a new stack', () => {
    const { element, getImageIds } = createViewport(makeStack('a'));
    const newImageIds = makeStack('b');
    cacheImage(newImageIds[5]);
    prefetch.enable(element);
    prefetch.disable(element);
    getImageIds.mockReturnValue(newImageIds);
    prefetch.enable(element);

    cache.removeImageLoadObject(newImageIds[5]);

    expect(timesQueued(element, 5)).toBe(1);
    prefetch.disable(element);
  });

  it('removes only the listener of the disabled element', () => {
    const imageIds = makeStack('a');
    const first = createViewport(imageIds);
    const second = createViewport(imageIds);
    cacheImage(imageIds[5]);
    prefetch.enable(first.element);
    prefetch.enable(second.element);

    prefetch.disable(first.element);
    cache.removeImageLoadObject(imageIds[5]);

    expect(timesQueued(first.element, 5)).toBe(0);
    expect(timesQueued(second.element, 5)).toBe(1);
    prefetch.disable(second.element);
  });

  it('keeps the listener of the other prefetch utility on disable', () => {
    const imageIds = makeStack('a');
    const { element } = createViewport(imageIds);
    cacheImage(imageIds[5]);
    otherPrefetch.enable(element);
    prefetch.enable(element);

    prefetch.disable(element);
    cache.removeImageLoadObject(imageIds[5]);

    expect(timesQueued(element, 5)).toBe(1);
    otherPrefetch.disable(element);
  });

  it('keeps no listener for an element that was disabled', () => {
    const numListeners = countListeners();
    const { element, viewportId } = createViewport(makeStack('a'));

    prefetch.enable(element);
    prefetch.enable(element);
    prefetch.disable(element);
    engine.disableElement(viewportId);

    expect(countListeners()).toBe(numListeners);
  });

  it('keeps the listeners of others when it was not enabled', () => {
    const imageIds = makeStack('a');
    const enabled = createViewport(imageIds);
    const neverEnabled = createViewport(imageIds);
    cacheImage(imageIds[5]);
    prefetch.enable(enabled.element);

    prefetch.disable(neverEnabled.element);
    cache.removeImageLoadObject(imageIds[5]);

    expect(timesQueued(enabled.element, 5)).toBe(1);
    prefetch.disable(enabled.element);
  });
});

it('stackPrefetch requests a removed image once after repeated enable calls', () => {
  jest.useFakeTimers();
  const imageIds = makeStack('a');
  const { element } = createViewport(imageIds);
  cacheImage(imageIds[5]);
  stackPrefetch.enable(element);
  stackPrefetch.enable(element);
  cache.removeImageLoadObject(imageIds[5]);
  addRequest.mockClear();

  triggerEvent(element, STACK_NEW_IMAGE);
  jest.runOnlyPendingTimers();

  const requests = addRequest.mock.calls.filter(
    ([, , details]) => details.imageId === imageIds[5]
  );
  expect(requests).toHaveLength(1);
  stackPrefetch.disable(element);
});

describe('stackContextPrefetch cache fill', () => {
  const flush = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
  let finishLoads;

  beforeEach(() => {
    const pendingLoads = [];
    imageLoader.registerImageLoader('deferred', (imageId) => ({
      promise: new Promise((resolve) =>
        pendingLoads.push(() => resolve({ imageId, sizeInBytes: 8 }))
      ),
    }));
    finishLoads = async () => {
      pendingLoads.splice(0).forEach((finishLoad) => finishLoad());
      await flush();
    };
    // Run each request at once, the load itself finishes in finishLoads
    addRequest.mockImplementation((requestFn) => {
      requestFn();
    });
  });

  const makeDeferredStack = (name) =>
    Array.from({ length: 10 }, (_, k) => `deferred:${name}:${k}`);

  it('fills the cache while enabled', async () => {
    const { element } = createViewport(makeDeferredStack('enabled'));
    stackContextPrefetch.enable(element);
    addRequest.mockClear();

    await finishLoads();

    expect(addRequest).toHaveBeenCalledTimes(7);
    expect(getToolState(element).cacheFill).toBe(true);
    stackContextPrefetch.disable(element);
  });

  it('does not fill the cache after disable', async () => {
    const { element } = createViewport(makeDeferredStack('disabled'));
    stackContextPrefetch.enable(element);
    stackContextPrefetch.disable(element);
    addRequest.mockClear();

    await finishLoads();

    expect(addRequest).not.toHaveBeenCalled();
    expect(getToolState(element).enabled).toBe(false);
    expect(getToolState(element).cacheFill).toBe(false);
  });

  it('fills the cache when enabled again before the requests finish', async () => {
    const { element } = createViewport(makeDeferredStack('enabled-again'));
    stackContextPrefetch.enable(element);
    stackContextPrefetch.disable(element);
    stackContextPrefetch.enable(element);
    addRequest.mockClear();

    await finishLoads();

    expect(addRequest).toHaveBeenCalledTimes(7);
    stackContextPrefetch.disable(element);
  });

  // Nothing is left to request at the end of the stack, so prefetch sets the
  // enabled flag of the state to false, although disable was not called.
  it.each([
    ['first', 1, 0],
    ['last', 8, 9],
  ])(
    'fills the cache after a scroll to the %s image during a request',
    async (name, from, to) => {
      const { element, viewportId } = createViewport(makeDeferredStack(name));
      const { getCurrentImageIdIndex } = engine.getViewport(viewportId);
      getCurrentImageIdIndex.mockReturnValue(from);
      stackContextPrefetch.enable(element);
      getCurrentImageIdIndex.mockReturnValue(to);
      triggerEvent(element, STACK_NEW_IMAGE);
      await flush(20);
      expect(getToolState(element).indicesToRequest).toEqual([]);
      addRequest.mockClear();

      await finishLoads();

      expect(addRequest).toHaveBeenCalled();
      expect(getToolState(element).cacheFill).toBe(true);
      stackContextPrefetch.disable(element);
    }
  );
});
