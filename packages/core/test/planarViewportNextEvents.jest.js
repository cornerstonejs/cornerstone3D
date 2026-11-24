import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { describe, it, expect, afterEach } from '@jest/globals';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';

const {
  setRenderBackend,
  Enums,
  imageLoader,
  metaData,
  init,
  cache,
  eventTarget,
} = cornerstone3D;
const { Events } = Enums;

const recordedEvents = [
  'CORNERSTONE_PRE_STACK_NEW_IMAGE',
  'CORNERSTONE_STACK_NEW_IMAGE',
  Events.NEW_IMAGE,
  Events.VIEWPORT_NEW_IMAGE_SET,
  'CORNERSTONE_STACK_VIEWPORT_SCROLL',
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
  window.devicePixelRatio = 1;
  init({});
  setRenderBackend('cpu');
  imageLoader.registerImageLoader('fakeImageLoader', testImageLoader);
  metaData.addProvider(fakeMetaDataProvider, 10000);

  const element = document.createElement('div');
  document.body.appendChild(element);
  setSize(element, 64, 64);

  return element;
}

/** Shows a stack on a direct next viewport. */
async function showStack(viewport, imageIds, imageIdIndex = 0) {
  displaySetRegistry.add('stack', {
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

/**
 * The image index that a direct next viewport goes to: its current index.
 * The legacy stack viewport gave its target index here.
 */
function getRequestedImageIdIndex(viewport) {
  return viewport.getCurrentImageIdIndex();
}

/**
 * The details of STACK_NEW_IMAGE and VIEWPORT_NEW_IMAGE_SET that the legacy
 * stack viewport fired for `setStack(imageIds, 1)`, less the image, the
 * element and the ids of the viewport and of its rendering engine.
 */
function legacySetStackDetails(imageIds) {
  return {
    stackNewImage: { imageId: imageIds[1], imageIdIndex: 1 },
    newImageSet: { imageIds, currentImageIdIndex: 1 },
  };
}

/**
 * The image indices that the legacy stack viewport read back around
 * `setImageIdIndex(2)` from image 0, with the load of image 2 held back: the
 * current and the target index before the call, at once after it and after
 * the load, whether the call resolved before the load, whether the image was
 * shown when it resolved, and the index of the image id that it resolved
 * with.
 */
const LEGACY_SET_IMAGE_ID_INDEX_READS = {
  before: [0, 0],
  afterRequest: [2, 2],
  afterLoad: [2, 2],
  resolvedBeforeLoad: false,
  shownAtResolve: true,
  imageIdIndex: 2,
};

/**
 * What `isReferenceViewable` of the legacy stack viewport on image 1
 * answered for image 1 of a labelmap on the same geometry with `asOverlay`,
 * for its image 2 with `asOverlay`, and for its image 1 without options.
 */
const LEGACY_OVERLAY_VIEWABLE = [true, false, false];

/**
 * What `isReferenceViewable` of the legacy stack viewport on image 1, on the
 * CPU and on the GPU, answered with `asNearbyProjection` for references with
 * only the focal point [3, 4, z], for z = 1.0004, 0.9996 and 1.002: a point
 * within half the spacing of the image data along its normal (0.001) is
 * viewable.
 */
const LEGACY_NEARBY_PROJECTION_VIEWABLE = [true, true, false];

/**
 * Resolves when the element fires NEW_IMAGE for an image index. A direct next
 * viewport and a legacy adapter both fire it.
 */
function waitForNewImage(element, imageIdIndex) {
  return new Promise((resolve) => {
    const listener = (evt) => {
      if (evt.detail.imageIdIndex === imageIdIndex) {
        element.removeEventListener(Events.NEW_IMAGE, listener);
        resolve();
      }
    };

    element.addEventListener(Events.NEW_IMAGE, listener);
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

  /** Makes a direct next viewport on its element. */
  function createNextViewport(defaultOptions = {}) {
    const next = createPlanarViewportOnStandInEngine(setUpCore(), 'next', {
      defaultOptions,
    });

    renderingEngines.push(next.renderingEngine);

    return next.viewport;
  }

  afterEach(() => {
    renderingEngines.forEach((renderingEngine) => renderingEngine.destroy());
    renderingEngines = [];
    loads.release();
    loads.imageIds = [];
    cache.purgeCache();
    displaySetRegistry.clear?.();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    setRenderBackend('auto');
    document.body.innerHTML = '';
  });

  describe('new data', () => {
    it('fires NEW_IMAGE and VIEWPORT_NEW_IMAGE_SET when a stack is shown, and neither the PRE_STACK_NEW_IMAGE nor the STACK_NEW_IMAGE of the legacy setStack', async () => {
      const imageIds = createImageIds();
      const viewport = createNextViewport();
      const next = recordEvents(viewport.element);
      const legacy = legacySetStackDetails(imageIds);

      await showStack(viewport, imageIds, 1);

      expect(next.events).toEqual([
        `${Events.NEW_IMAGE}:1`,
        `${Events.VIEWPORT_NEW_IMAGE_SET}:1`,
      ]);
      expect(next.details[Events.NEW_IMAGE]).toEqual({
        ...legacy.stackNewImage,
        numberOfSlices: imageIds.length,
        image: expect.objectContaining({ imageId: imageIds[1] }),
        viewportId: 'next',
        renderingEngineId: expect.any(String),
      });
      expect(next.details[Events.VIEWPORT_NEW_IMAGE_SET]).toEqual({
        ...legacy.newImageSet,
        viewportId: 'next',
        element: next.details[Events.VIEWPORT_NEW_IMAGE_SET].element,
      });
      expect(next.details[Events.VIEWPORT_NEW_IMAGE_SET].imageIds).toEqual(
        imageIds
      );
    });
  });

  describe('stack events', () => {
    it('fires CAMERA_MODIFIED and NEW_IMAGE when the image changes, and none of PRE_STACK_NEW_IMAGE, STACK_NEW_IMAGE and STACK_VIEWPORT_SCROLL of the legacy stack viewport', async () => {
      const imageIds = createImageIds();
      const viewport = createNextViewport();
      const { element } = viewport;
      const record = recordEvents(element);
      const next = {};
      let cameraEvents = 0;

      await showStack(viewport, imageIds, 1);
      record.events.splice(0);
      element.addEventListener(Events.CAMERA_MODIFIED, () => cameraEvents++);

      const setIndexImage = waitForNewImage(element, 3);
      await viewport.setImageIdIndex(3);
      await setIndexImage;
      next.setImageIdIndex = record.events.splice(0);
      next.setImageIdIndexCameraEvents = cameraEvents;

      await viewport.setImageIdIndex(3);
      next.sameIndex = record.events.splice(0);
      cameraEvents = 0;

      const scrollImage = waitForNewImage(element, 2);
      viewport.scroll(-1, false);
      await scrollImage;
      next.scroll = record.events.splice(0);
      next.scrollCameraEvents = cameraEvents;

      viewport.scroll(5, false);
      next.scrollPastEnd = record.events.splice(0);
      await settle();
      next.index = viewport.getCurrentImageIdIndex();

      expect(next).toEqual({
        setImageIdIndex: [`${Events.NEW_IMAGE}:3`],
        setImageIdIndexCameraEvents: 1,
        sameIndex: [],
        scroll: [`${Events.NEW_IMAGE}:2`],
        scrollCameraEvents: 1,
        scrollPastEnd: [],
        index: 3,
      });
    });
  });

  describe('a failed image load', () => {
    it('fires IMAGE_LOAD_FAILED of the image loader, and not the IMAGE_LOAD_ERROR of the legacy stack viewport', async () => {
      const imageIds = createImageIds({ fail: [2] });
      const viewport = createNextViewport();
      const next = [];
      const onFailed = (evt) =>
        next.push({ name: Events.IMAGE_LOAD_FAILED, detail: evt.detail });
      const onError = (evt) =>
        next.push({ name: Events.IMAGE_LOAD_ERROR, detail: evt.detail });

      eventTarget.addEventListener(Events.IMAGE_LOAD_FAILED, onFailed);
      eventTarget.addEventListener(Events.IMAGE_LOAD_ERROR, onError);

      try {
        await showStack(viewport, imageIds, 0);
        await viewport.setImageIdIndex(2).catch(() => undefined);
        await settle();
      } finally {
        eventTarget.removeEventListener(Events.IMAGE_LOAD_FAILED, onFailed);
        eventTarget.removeEventListener(Events.IMAGE_LOAD_ERROR, onError);
      }

      cache.purgeCache();

      const failed = {
        name: Events.IMAGE_LOAD_FAILED,
        detail: { imageId: imageIds[2], error: expect.any(Error) },
      };

      expect(next).toEqual([failed]);
    });

    it('leaves no unhandled rejection', async () => {
      const imageIds = createImageIds({ fail: [2] });
      const rejections = [];
      const onRejection = (reason) => rejections.push(reason);
      const next = createNextViewport();

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
      const next = createNextViewport();

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
      const viewport = createNextViewport();
      const { element } = viewport;
      const imageIds = createImageIds({ name: `${viewport.id}URI` });
      let shown = false;
      let shownAtResolve;

      await showStack(viewport, imageIds, 0);
      element.addEventListener(Events.NEW_IMAGE, (evt) => {
        shown ||= evt.detail.imageIdIndex === 2;
      });

      const before = [
        viewport.getCurrentImageIdIndex(),
        getRequestedImageIdIndex(viewport),
      ];

      loads.held = true;

      const promise = viewport.setImageIdIndex(2).then((imageId) => {
        shownAtResolve = shown;

        return imageId;
      });
      const afterRequest = [
        viewport.getCurrentImageIdIndex(),
        getRequestedImageIdIndex(viewport),
      ];

      await settle();

      const resolvedBeforeLoad = shownAtResolve !== undefined;

      loads.release();

      const imageId = await promise;
      const afterLoad = [
        viewport.getCurrentImageIdIndex(),
        getRequestedImageIdIndex(viewport),
      ];
      const next = {
        before,
        afterRequest,
        afterLoad,
        resolvedBeforeLoad,
        shownAtResolve,
        imageIdIndex: imageIds.indexOf(imageId),
      };

      expect(next).toEqual(LEGACY_SET_IMAGE_ID_INDEX_READS);
    });
  });

  describe('references', () => {
    it('takes a labelmap image on the geometry of the image shown as viewable with asOverlay, as the legacy stack viewport', async () => {
      const imageIds = createImageIds();
      const labelmapImageIds = createImageIds({ name: 'labelmapURI' });
      const viewport = createNextViewport();

      await showStack(viewport, imageIds, 1);

      const answers = [
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
      ];

      expect(answers).toEqual(LEGACY_OVERLAY_VIEWABLE);
    });

    it('takes a point within half a slice spacing of the image shown as viewable with asNearbyProjection, as the legacy stack viewport', async () => {
      const viewport = createNextViewport();

      await showStack(viewport, createImageIds(), 1);

      const answers = [
        [3, 4, 1.0004],
        [3, 4, 0.9996],
        [3, 4, 1.002],
      ].map((cameraFocalPoint) =>
        viewport.isReferenceViewable(
          { cameraFocalPoint },
          { asNearbyProjection: true }
        )
      );

      expect(answers).toEqual(LEGACY_NEARBY_PROJECTION_VIEWABLE);
    });
  });
});
