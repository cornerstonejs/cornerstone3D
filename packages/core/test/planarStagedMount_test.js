import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  waitFor,
} from './utils/planarSeriesBothModes';

const {
  Enums,
  utilities,
  imageLoader,
  metaData,
  eventTarget,
  cache,
  getRenderBackend,
  setRenderBackend,
} = cornerstone3D;
const { Events, OrientationAxis, ImageQualityStatus } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The image ids of a stack of two images of 16 by 16 pixels with a bar. */
function createImageIds(id) {
  return [0, 1].map((sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: id,
      id,
      rows: 16,
      columns: 16,
      barStart: 4,
      barWidth: 8,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );
}

/** A promise and the function that resolves it. */
function createGate() {
  let open;
  const promise = new Promise((resolve) => {
    open = resolve;
  });

  return { promise, open };
}

/**
 * Registers an image loader in place of the fake one. An image gets the
 * quality of its retrieve options; an image of a quality below the full one
 * is the preview, with no bar (every pixel 0). The final stage of
 * `sourceImageId` waits for `finalStage`, and every load of an image of
 * `overlayImageIds` waits for `overlay`. `overlayRequested` opens at the
 * first load of the overlay.
 */
function registerStagedImageLoader({
  sourceImageId,
  overlayImageIds,
  finalStage,
  overlay,
  overlayRequested,
}) {
  imageLoader.registerImageLoader('fakeImageLoader', (imageId, options) => {
    const imageQualityStatus =
      options?.retrieveOptions?.imageQualityStatus ??
      ImageQualityStatus.FULL_RESOLUTION;
    const load = () =>
      testUtils.fakeImageLoader(imageId, options).promise.then((image) => {
        image.imageQualityStatus = imageQualityStatus;

        if (imageQualityStatus !== ImageQualityStatus.FULL_RESOLUTION) {
          image.voxelManager.getScalarData().fill(0);
        }

        return image;
      });

    if (overlayImageIds.includes(imageId)) {
      overlayRequested.open();

      return { promise: overlay.promise.then(load) };
    }

    if (
      imageId === sourceImageId &&
      imageQualityStatus === ImageQualityStatus.FULL_RESOLUTION
    ) {
      return { promise: finalStage.promise.then(load) };
    }

    return { promise: load() };
  });
}

/** Resolves when IMAGE_LOADED gives the full quality image of `imageId`. */
function finalImageLoaded(imageId) {
  return new Promise((resolve) => {
    const listener = (evt) => {
      const { image } = evt.detail;

      if (
        image?.imageId === imageId &&
        image.imageQualityStatus === ImageQualityStatus.FULL_RESOLUTION
      ) {
        eventTarget.removeEventListener(Events.IMAGE_LOADED, listener);
        resolve();
      }
    };

    eventTarget.addEventListener(Events.IMAGE_LOADED, listener);
  });
}

/** The largest value of the image data of the source display set. */
function largestSourceValue(viewport) {
  return Math.max(...viewport.getImageData().imageData.getScalarData());
}

/**
 * The red value that the shown canvas draws at the center of the pixel
 * `[i, j]` of the image of the source display set.
 */
function shownValueOfPixel(viewport, [i, j]) {
  const shown = Array.from(viewport.element.querySelectorAll('canvas')).find(
    (canvas) => canvas.style.display !== 'none'
  );
  const world = viewport.getImageData().imageData.indexToWorld([i, j, 0]);
  const [x, y] = viewport.worldToCanvas(world);
  const scale = shown.width / shown.clientWidth;

  return shown
    .getContext('2d')
    .getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data[0];
}

describe('A stack of a direct next planar viewport whose final image stage comes while a later display set of the same mount loads -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
    metaData.addProvider(
      utilities.imageRetrieveMetadataProvider.get.bind(
        utilities.imageRetrieveMetadataProvider
      ),
      10000
    );
    utilities.imageRetrieveMetadataProvider.add('stack', {
      stages: [
        { id: 'lossyStage', retrieveType: 'lossy' },
        { id: 'finalStage', retrieveType: 'final' },
      ],
      retrieveOptions: {
        lossy: { imageQualityStatus: ImageQualityStatus.LOSSY },
        final: {},
      },
    });
  });

  afterEach(function () {
    utilities.imageRetrieveMetadataProvider.clear();
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  for (const renderBackend of ['gpu', 'cpu']) {
    it(`draws the final image on the ${renderBackend.toUpperCase()}, not the preview`, async function () {
      const sourceImageIds = createImageIds(`stagedSource${renderBackend}`);
      const overlayImageIds = createImageIds(`stagedOverlay${renderBackend}`);
      const finalStage = createGate();
      const overlay = createGate();
      const overlayRequested = createGate();
      const options = {
        orientation: OrientationAxis.ACQUISITION,
        renderBackend,
      };

      registerStagedImageLoader({
        sourceImageId: sourceImageIds[0],
        overlayImageIds,
        finalStage,
        overlay,
        overlayRequested,
      });
      cornerstone3D.displaySetRegistry.add('staged:source', {
        imageIds: sourceImageIds,
        initialImageIdIndex: 0,
      });
      cornerstone3D.displaySetRegistry.add('staged:overlay', {
        imageIds: overlayImageIds,
        initialImageIdIndex: 0,
      });

      const viewport = createNextViewport(renderingEngine, 'stagedPreview');
      const finalLoaded = finalImageLoaded(sourceImageIds[0]);
      const mount = viewport.setDisplaySets(
        { displaySetId: 'staged:source', options },
        { displaySetId: 'staged:overlay', options }
      );

      await overlayRequested.promise;
      finalStage.open();
      await finalLoaded;
      overlay.open();
      await mount;

      expect(viewport.getCurrentImageId()).toBe(sourceImageIds[0]);
      expect(largestSourceValue(viewport)).toBeGreaterThan(0);

      viewport.setDisplaySetAppearance('staged:overlay', { visible: false });
      await renderAndWait(viewport);

      expect(shownValueOfPixel(viewport, [8, 8])).toBeGreaterThan(
        shownValueOfPixel(viewport, [1, 8])
      );
    });

    it(`draws the final image on the ${renderBackend.toUpperCase()} when it comes just after the commit looks for the best cached image`, async function () {
      const sourceImageIds = createImageIds(`commitSource${renderBackend}`);
      const overlayImageIds = createImageIds(`commitOverlay${renderBackend}`);
      const finalStage = createGate();
      const overlay = createGate();
      const overlayRequested = createGate();
      const options = {
        orientation: OrientationAxis.ACQUISITION,
        renderBackend,
      };

      registerStagedImageLoader({
        sourceImageId: sourceImageIds[0],
        overlayImageIds,
        finalStage,
        overlay,
        overlayRequested,
      });
      cornerstone3D.displaySetRegistry.add('commit:source', {
        imageIds: sourceImageIds,
        initialImageIdIndex: 0,
      });
      cornerstone3D.displaySetRegistry.add('commit:overlay', {
        imageIds: overlayImageIds,
        initialImageIdIndex: 0,
      });

      const viewport = createNextViewport(renderingEngine, 'stagedCommit');
      const finalLoaded = finalImageLoaded(sourceImageIds[0]);
      const mount = viewport.setDisplaySets(
        { displaySetId: 'commit:source', options },
        { displaySetId: 'commit:overlay', options }
      );

      await overlayRequested.promise;
      const previewImage = cache.getImage(sourceImageIds[0]);

      finalStage.open();
      await finalLoaded;
      const finalImage = cache.getImage(sourceImageIds[0]);
      const getImage = cache.getImage.bind(cache);
      let armed = false;
      let published = false;

      expect(previewImage.imageQualityStatus).toBe(ImageQualityStatus.LOSSY);
      expect(finalImage.imageQualityStatus).toBe(
        ImageQualityStatus.FULL_RESOLUTION
      );
      spyOn(cache, 'getImage').and.callFake((imageId) => {
        if (imageId !== sourceImageIds[0] || published) {
          return getImage(imageId);
        }

        if (armed) {
          armed = false;
          queueMicrotask(() => {
            published = true;
            utilities.triggerEvent(eventTarget, Events.IMAGE_LOADED, {
              image: finalImage,
            });
          });
        }

        return previewImage;
      });
      armed = true;
      overlay.open();
      await mount;

      expect(published).toBe(true);
      await waitFor(() => largestSourceValue(viewport) > 0, 1000).catch(
        () => undefined
      );
      expect(largestSourceValue(viewport)).toBeGreaterThan(0);

      viewport.setDisplaySetAppearance('commit:overlay', { visible: false });
      await renderAndWait(viewport);

      expect(shownValueOfPixel(viewport, [8, 8])).toBeGreaterThan(
        shownValueOfPixel(viewport, [1, 8])
      );
    });
  }
});

describe('A display set of a direct next planar viewport whose registration goes while a later display set of the same mount loads -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('mounts the display set with the registration that it loaded', async function () {
    const shownImageIds = createImageIds('registrationShown');
    const sourceImageIds = createImageIds('registrationSource');
    const overlayImageIds = createImageIds('registrationOverlay');
    const overlay = createGate();
    const overlayRequested = createGate();
    const options = { orientation: OrientationAxis.ACQUISITION };

    imageLoader.registerImageLoader('fakeImageLoader', (imageId, options) => {
      if (overlayImageIds.includes(imageId)) {
        overlayRequested.open();

        return {
          promise: overlay.promise.then(
            () => testUtils.fakeImageLoader(imageId, options).promise
          ),
        };
      }

      return testUtils.fakeImageLoader(imageId, options);
    });
    [
      ['registration:shown', shownImageIds],
      ['registration:source', sourceImageIds],
      ['registration:overlay', overlayImageIds],
    ].forEach(([displaySetId, imageIds]) =>
      cornerstone3D.displaySetRegistry.add(displaySetId, {
        imageIds,
        initialImageIdIndex: 0,
      })
    );

    const viewport = createNextViewport(renderingEngine, 'stagedRegistration');

    await viewport.setDisplaySets({
      displaySetId: 'registration:shown',
      options,
    });
    await renderAndWait(viewport);

    const mount = viewport.setDisplaySets(
      { displaySetId: 'registration:source', options },
      { displaySetId: 'registration:overlay', options }
    );

    await overlayRequested.promise;
    cornerstone3D.displaySetRegistry.remove('registration:source');
    overlay.open();
    await mount;

    expect(
      viewport.getRenderPlan().map(({ displaySetId }) => displaySetId)
    ).toEqual(['registration:source', 'registration:overlay']);
    expect(viewport.getImageIds()).toEqual(sourceImageIds);
    expect(viewport.getCurrentImageId()).toBe(sourceImageIds[0]);
  });

  it('names the volume that it mounted in its VOI events when the registration names another volume meanwhile', async function () {
    const seriesA = await createSeries({ id: 'voiRegistrationA' });
    const seriesB = await createSeries({ id: 'voiRegistrationB' });
    const overlayImageIds = createImageIds('voiRegistrationOverlay');
    const overlay = createGate();
    const overlayRequested = createGate();
    const options = { orientation: OrientationAxis.ACQUISITION };

    imageLoader.registerImageLoader('fakeImageLoader', (imageId, options) => {
      if (overlayImageIds.includes(imageId)) {
        overlayRequested.open();

        return {
          promise: overlay.promise.then(
            () => testUtils.fakeImageLoader(imageId, options).promise
          ),
        };
      }

      return testUtils.fakeImageLoader(imageId, options);
    });
    cornerstone3D.displaySetRegistry.add('voi:scan', {
      imageIds: seriesA.imageIds,
      volumeId: seriesA.volumeId,
    });
    cornerstone3D.displaySetRegistry.add('voi:overlay', {
      imageIds: overlayImageIds,
      initialImageIdIndex: 0,
    });

    const viewport = createNextViewport(renderingEngine, 'stagedVOI');
    const events = [];
    const listener = (evt) => events.push(evt.detail);

    viewport.element.addEventListener(
      Events.DISPLAY_SET_APPEARANCE_CHANGED,
      listener
    );

    const mount = viewport.setDisplaySets(
      { displaySetId: 'voi:scan', options },
      { displaySetId: 'voi:overlay', options }
    );

    await overlayRequested.promise;
    cornerstone3D.displaySetRegistry.add('voi:scan', {
      imageIds: seriesB.imageIds,
      volumeId: seriesB.volumeId,
    });
    overlay.open();
    await mount;

    expect(viewport.getVolumeId()).toBe(seriesA.volumeId);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].volumeId).toBe(seriesA.volumeId);

    events.length = 0;
    viewport.setDisplaySetAppearance('voi:scan', {
      voiRange: { lower: 10, upper: 90 },
    });

    expect(events.length).toBe(1);
    expect(events[0].volumeId).toBe(seriesA.volumeId);
    viewport.element.removeEventListener(
      Events.DISPLAY_SET_APPEARANCE_CHANGED,
      listener
    );
  });
});

describe('A stack of a direct next planar viewport whose render backend changes while a later display set of the same mount loads -- ', () => {
  let renderingEngine;
  let previousRenderBackend;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
    previousRenderBackend = getRenderBackend();
  });

  afterEach(function () {
    setRenderBackend(previousRenderBackend);
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('mounts the stack on the backend of the configuration at the mount, with the image it loaded', async function () {
    const sourceImageIds = createImageIds('backendSource');
    const overlayImageIds = createImageIds('backendOverlay');
    const overlay = createGate();
    const overlayRequested = createGate();
    const loads = {};

    imageLoader.registerImageLoader('fakeImageLoader', (imageId, options) => {
      loads[imageId] = (loads[imageId] ?? 0) + 1;

      if (overlayImageIds.includes(imageId)) {
        overlayRequested.open();

        return {
          promise: overlay.promise.then(
            () => testUtils.fakeImageLoader(imageId, options).promise
          ),
        };
      }

      return testUtils.fakeImageLoader(imageId, options);
    });
    cornerstone3D.displaySetRegistry.add('backend:source', {
      imageIds: sourceImageIds,
      initialImageIdIndex: 0,
    });
    cornerstone3D.displaySetRegistry.add('backend:overlay', {
      imageIds: overlayImageIds,
      initialImageIdIndex: 0,
    });
    setRenderBackend('gpu');

    const viewport = createNextViewport(renderingEngine, 'stagedBackend');
    const options = { orientation: OrientationAxis.ACQUISITION };
    const mount = viewport.setDisplaySets(
      { displaySetId: 'backend:source', options },
      { displaySetId: 'backend:overlay', options }
    );

    await overlayRequested.promise;
    setRenderBackend('cpu');
    overlay.open();
    await mount;

    expect(
      viewport.getRenderPlan().map(({ displaySetId, draw, renderMode }) => ({
        displaySetId,
        draw,
        renderMode,
      }))
    ).toEqual([
      { displaySetId: 'backend:source', draw: 'cpu', renderMode: 'cpuImage' },
      { displaySetId: 'backend:overlay', draw: 'cpu', renderMode: 'cpuImage' },
    ]);
    expect(loads[sourceImageIds[0]]).toBe(1);
  });
});
