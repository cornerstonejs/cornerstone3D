import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { describe, it, expect, afterEach } from '@jest/globals';
import PlanarViewport from '../src/RenderingEngine/GenericViewport/Planar/PlanarViewport';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';

const {
  utilities,
  setUseCPURendering,
  RenderingEngine,
  Enums,
  imageLoader,
  metaData,
  init,
  cache,
  eventTarget,
} = cornerstone3D;
const { ViewportType, Events } = Enums;

const recordedEvents = [
  Events.PRE_STACK_NEW_IMAGE,
  Events.STACK_NEW_IMAGE,
  Events.VIEWPORT_NEW_IMAGE_SET,
  Events.STACK_VIEWPORT_SCROLL,
];

/**
 * Image ids of the fake image loader for a stack of four 16 by 16 images,
 * one per millimetre along z. `name` makes other image ids on the same
 * geometry; `fail` marks the indices whose load rejects.
 */
function createImageIds({ name = 'imageURI', fail = [] } = {}) {
  return [0, 1, 2, 3].map(
    (sliceIndex) =>
      `fakeImageLoader:${encodeURIComponent(
        JSON.stringify({
          loader: 'fakeImageLoader',
          name,
          rows: 16,
          columns: 16,
          barStart: 2,
          barWidth: 4,
          xSpacing: 1,
          ySpacing: 1,
          sliceIndex,
          ...(fail.includes(sliceIndex) ? { fail: true } : {}),
        })
      )}`
  );
}

function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

/**
 * The loads that the image loader of the tests started, and the gate that
 * holds them back while `held` is set. A load of an image id marked `fail`
 * rejects.
 */
const loads = {
  imageIds: [],
  held: false,
  waiting: [],
  release() {
    this.held = false;
    this.waiting.splice(0).forEach((resolve) => resolve());
  },
};

function testImageLoader(imageId) {
  loads.imageIds.push(imageId);

  const gate = loads.held
    ? new Promise((resolve) => loads.waiting.push(resolve))
    : Promise.resolve();

  return {
    promise: gate.then(() => {
      if (imageId.includes(encodeURIComponent('"fail":true'))) {
        throw new Error(`fake load failure of ${imageId}`);
      }

      return fakeImageLoader(imageId).promise;
    }),
  };
}

/**
 * Turns CPU rendering on, registers the image loader of the tests and gives
 * a 64 by 64 element for a viewport.
 */
function setUpCore() {
  setUseCPURendering(true);
  window.devicePixelRatio = 1;
  init({});
  imageLoader.registerImageLoader('fakeImageLoader', testImageLoader);
  metaData.addProvider(fakeMetaDataProvider, 10000);

  const element = document.createElement('div');
  document.body.appendChild(element);
  setSize(element, 64, 64);

  return element;
}

/** Makes a legacy CPU stack viewport in a rendering engine. */
function createLegacy(element, defaultOptions = {}) {
  const renderingEngine = new RenderingEngine(utilities.uuidv4());

  renderingEngine.enableElement({
    viewportId: 'legacy',
    type: ViewportType.STACK,
    element,
    defaultOptions,
  });

  return { renderingEngine, viewport: renderingEngine.getViewport('legacy') };
}

/**
 * Makes a direct next planar viewport on a stand-in rendering engine. A real
 * rendering engine needs WebGL for a planar viewport, which jsdom lacks; the
 * CPU render paths draw without it.
 */
function createNext(element, defaultOptions = {}) {
  const renderer = { getActiveCamera: () => ({ setParallelProjection() {} }) };
  let viewport;
  const renderingEngine = {
    id: utilities.uuidv4(),
    getRenderer: () => renderer,
    getViewports: () => (viewport ? [viewport] : []),
    renderViewport() {},
    destroy() {
      viewport.destroy();
      renderingEngineCache.delete(renderingEngine.id);
    },
  };

  renderingEngineCache.set(renderingEngine);
  viewport = new PlanarViewport({
    id: 'next',
    element,
    renderingEngineId: renderingEngine.id,
    canvas: document.createElement('canvas'),
    sWidth: 64,
    sHeight: 64,
    defaultOptions,
  });

  return { renderingEngine, viewport };
}

/** Shows a stack on a legacy viewport or on a direct next viewport. */
async function showStack(viewport, imageIds, imageIdIndex = 0) {
  if (!utilities.isGenericViewport(viewport)) {
    return viewport.setStack(imageIds, imageIdIndex);
  }

  genericViewportDisplaySetMetadataProvider.add('stack', {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: imageIdIndex,
  });

  return viewport.setDisplaySets({ displaySetId: 'stack' });
}

/** Records the stack events of an element as `name:index`, with details. */
function recordEvents(element) {
  const events = [];
  const details = {};

  recordedEvents.forEach((eventName) => {
    element.addEventListener(eventName, (evt) => {
      const index =
        evt.detail.imageIdIndex ??
        evt.detail.newImageIdIndex ??
        evt.detail.currentImageIdIndex;

      events.push(`${eventName}:${index}`);
      details[eventName] = evt.detail;
    });
  });

  return { events, details };
}

/** Resolves when the element fires STACK_NEW_IMAGE for an image index. */
function waitForNewImage(element, imageIdIndex) {
  return new Promise((resolve) => {
    const listener = (evt) => {
      if (evt.detail.imageIdIndex === imageIdIndex) {
        element.removeEventListener(Events.STACK_NEW_IMAGE, listener);
        resolve();
      }
    };

    element.addEventListener(Events.STACK_NEW_IMAGE, listener);
  });
}

/** Resolves after the pending promise jobs and timers of a few turns. */
async function settle() {
  for (let turn = 0; turn < 5; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('Direct next planar viewport events and image loads against the legacy stack viewport', () => {
  let renderingEngines = [];

  /** Makes a legacy viewport and a direct next one, each on its element. */
  function createPair(defaultOptions = {}) {
    const legacyElement = setUpCore();
    const nextElement = setUpCore();
    const legacy = createLegacy(legacyElement, defaultOptions);
    const next = createNext(nextElement, defaultOptions);

    renderingEngines.push(legacy.renderingEngine, next.renderingEngine);

    return [legacy.viewport, next.viewport];
  }

  afterEach(() => {
    renderingEngines.forEach((renderingEngine) => renderingEngine.destroy());
    renderingEngines = [];
    loads.release();
    loads.imageIds = [];
    cache.purgeCache();
    genericViewportDisplaySetMetadataProvider.clear?.();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    setUseCPURendering(false);
    document.body.innerHTML = '';
  });

  describe('new data', () => {
    it('fires PRE_STACK_NEW_IMAGE, STACK_NEW_IMAGE and VIEWPORT_NEW_IMAGE_SET when a stack is shown, as the legacy setStack', async () => {
      const imageIds = createImageIds();
      const recorded = [];

      for (const viewport of createPair()) {
        const record = recordEvents(viewport.element);

        await showStack(viewport, imageIds, 1);
        recorded.push(record);
      }

      const [legacy, next] = recorded;

      expect(legacy.events).toEqual([
        `${Events.PRE_STACK_NEW_IMAGE}:1`,
        `${Events.STACK_NEW_IMAGE}:1`,
        `${Events.VIEWPORT_NEW_IMAGE_SET}:1`,
      ]);
      expect(next.events).toEqual(legacy.events);
      expect(next.details[Events.PRE_STACK_NEW_IMAGE]).toEqual({
        ...legacy.details[Events.PRE_STACK_NEW_IMAGE],
        viewportId: 'next',
        renderingEngineId: expect.any(String),
      });
      expect(next.details[Events.VIEWPORT_NEW_IMAGE_SET]).toEqual({
        ...legacy.details[Events.VIEWPORT_NEW_IMAGE_SET],
        viewportId: 'next',
        element: next.details[Events.VIEWPORT_NEW_IMAGE_SET].element,
      });
      expect(next.details[Events.VIEWPORT_NEW_IMAGE_SET].imageIds).toEqual(
        imageIds
      );
    });
  });

  describe('stack events', () => {
    it('fires PRE_STACK_NEW_IMAGE before an image changes and STACK_VIEWPORT_SCROLL on a scroll, as the legacy stack viewport', async () => {
      const imageIds = createImageIds();
      const recorded = [];

      for (const viewport of createPair()) {
        const { element } = viewport;
        const record = recordEvents(element);
        const steps = {};

        await showStack(viewport, imageIds, 1);
        record.events.splice(0);

        const setIndexImage = waitForNewImage(element, 3);
        await viewport.setImageIdIndex(3);
        await setIndexImage;
        steps.setImageIdIndex = record.events.splice(0);

        await viewport.setImageIdIndex(3);
        steps.sameIndex = record.events.splice(0);

        const scrollImage = waitForNewImage(element, 2);
        viewport.scroll(-1, false);
        await scrollImage;
        steps.scroll = record.events.splice(0);
        steps.scrollDetail = record.details[Events.STACK_VIEWPORT_SCROLL];
        steps.preDetail = record.details[Events.PRE_STACK_NEW_IMAGE];

        viewport.scroll(5, false);
        steps.scrollPastEnd = record.events.splice(0);
        await settle();
        recorded.push(steps);
      }

      const [legacy, next] = recorded;

      expect(legacy.setImageIdIndex).toEqual([
        `${Events.PRE_STACK_NEW_IMAGE}:3`,
        `${Events.STACK_NEW_IMAGE}:3`,
      ]);
      expect(legacy.scroll).toEqual([
        `${Events.PRE_STACK_NEW_IMAGE}:2`,
        `${Events.STACK_VIEWPORT_SCROLL}:2`,
        `${Events.STACK_NEW_IMAGE}:2`,
      ]);
      expect(next).toEqual({
        ...legacy,
        preDetail: {
          ...legacy.preDetail,
          viewportId: 'next',
          renderingEngineId: next.preDetail?.renderingEngineId,
        },
      });
    });
  });

  describe('a failed image load', () => {
    it('fires IMAGE_LOAD_ERROR with the legacy detail', async () => {
      const imageIds = createImageIds({ fail: [2] });
      const details = [];
      const listener = (evt) => details.push(evt.detail);

      eventTarget.addEventListener(Events.IMAGE_LOAD_ERROR, listener);

      try {
        for (const viewport of createPair()) {
          await showStack(viewport, imageIds, 0);
          await viewport.setImageIdIndex(2).catch(() => undefined);
          await settle();
        }
      } finally {
        eventTarget.removeEventListener(Events.IMAGE_LOAD_ERROR, listener);
      }

      expect(details.length).toBe(2);
      expect(details[1]).toEqual(details[0]);
      expect(details[0]).toEqual({
        error: expect.any(Error),
        imageIdIndex: 2,
        imageId: imageIds[2],
      });
    });

    it('leaves no unhandled rejection', async () => {
      const imageIds = createImageIds({ fail: [2] });
      const rejections = [];
      const onRejection = (reason) => rejections.push(reason);
      const [, next] = createPair();

      process.on('unhandledRejection', onRejection);

      try {
        await showStack(next, imageIds, 0);
        await next.setImageIdIndex(2);
        await settle();
      } finally {
        process.off('unhandledRejection', onRejection);
      }

      expect(rejections).toEqual([]);
    });

    it('loads the image again when the failed index is asked for again', async () => {
      const imageIds = createImageIds({ fail: [2] });
      const [, next] = createPair();

      await showStack(next, imageIds, 0);
      await next.setImageIdIndex(2);
      await settle();

      const loadsBefore = loads.imageIds.filter(
        (imageId) => imageId === imageIds[2]
      ).length;

      await next.setImageIdIndex(2);
      await settle();

      const loadsAfter = loads.imageIds.filter(
        (imageId) => imageId === imageIds[2]
      ).length;

      expect(loadsBefore).toBe(1);
      expect(loadsAfter).toBe(2);
    });
  });

  describe('setImageIdIndex and the index that is read back', () => {
    it('gives the requested index at once and resolves once the image is shown, as the legacy stack viewport', async () => {
      const measured = [];

      for (const viewport of createPair()) {
        const { element } = viewport;
        const imageIds = createImageIds({ name: `${viewport.id}URI` });
        let shown = false;
        let shownAtResolve;

        await showStack(viewport, imageIds, 0);
        element.addEventListener(Events.STACK_NEW_IMAGE, (evt) => {
          shown ||= evt.detail.imageIdIndex === 2;
        });

        const before = [
          viewport.getCurrentImageIdIndex(),
          viewport.getTargetImageIdIndex(),
        ];

        loads.held = true;

        const promise = viewport.setImageIdIndex(2).then((imageId) => {
          shownAtResolve = shown;

          return imageId;
        });
        const afterRequest = [
          viewport.getCurrentImageIdIndex(),
          viewport.getTargetImageIdIndex(),
        ];

        await settle();

        const resolvedBeforeLoad = shownAtResolve !== undefined;

        loads.release();

        const imageId = await promise;
        const afterLoad = [
          viewport.getCurrentImageIdIndex(),
          viewport.getTargetImageIdIndex(),
        ];

        measured.push({
          before,
          afterRequest,
          afterLoad,
          resolvedBeforeLoad,
          shownAtResolve,
          imageIdIndex: imageIds.indexOf(imageId),
        });
      }

      const [legacy, next] = measured;

      expect(legacy).toEqual({
        before: [0, 0],
        afterRequest: [2, 2],
        afterLoad: [2, 2],
        resolvedBeforeLoad: false,
        shownAtResolve: true,
        imageIdIndex: 2,
      });
      expect(next).toEqual(legacy);
    });
  });

  describe('references', () => {
    it('takes a labelmap image on the geometry of the image shown as viewable with asOverlay, as the legacy stack viewport', async () => {
      const imageIds = createImageIds();
      const labelmapImageIds = createImageIds({ name: 'labelmapURI' });
      const answers = [];

      for (const viewport of createPair()) {
        await showStack(viewport, imageIds, 1);

        answers.push([
          viewport.isReferenceViewable(
            { referencedImageId: labelmapImageIds[1] },
            { asOverlay: true }
          ),
          viewport.isReferenceViewable(
            { referencedImageId: labelmapImageIds[2] },
            { asOverlay: true }
          ),
          viewport.isReferenceViewable({
            referencedImageId: labelmapImageIds[1],
          }),
        ]);
      }

      expect(answers[0]).toEqual([true, false, false]);
      expect(answers[1]).toEqual(answers[0]);
    });

    it('takes a point within half a slice spacing of the image shown as viewable with asNearbyProjection, as the legacy stack viewport', async () => {
      const imageIds = createImageIds();
      const answers = [];

      for (const viewport of createPair()) {
        await showStack(viewport, imageIds, 1);

        answers.push(
          [
            [3, 4, 1.0004],
            [3, 4, 0.9996],
            [3, 4, 1.002],
          ].map((cameraFocalPoint) =>
            viewport.isReferenceViewable(
              { cameraFocalPoint },
              { asNearbyProjection: true }
            )
          )
        );
      }

      expect(answers[0]).toEqual([true, true, false]);
      expect(answers[1]).toEqual(answers[0]);
    });
  });
});
