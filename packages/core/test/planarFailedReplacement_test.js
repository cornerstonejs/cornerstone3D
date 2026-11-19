import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, imageLoader, volumeLoader } = cornerstone3D;
const { Events, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The scheme of the volume loader that has no data. */
const FAILING_VOLUME_SCHEME = 'planarFailedReplacementVolume';

/** The slice of the shown series that the tests show. */
const SHOWN_SLICE = 2;

/**
 * Makes the fake image loader reject the load of each image id of
 * `failingImageIds`, and wait, for each image id of `stalls`, until the
 * promise of that image id resolves.
 */
function registerFailingImageLoader(failingImageIds, stalls) {
  imageLoader.registerImageLoader('fakeImageLoader', (imageId, options) => {
    if (failingImageIds.has(imageId)) {
      return { promise: Promise.reject(new Error(`No data for ${imageId}`)) };
    }

    if (stalls.has(imageId)) {
      return {
        promise: stalls
          .get(imageId)
          .then(() => testUtils.fakeImageLoader(imageId, options).promise),
      };
    }

    return testUtils.fakeImageLoader(imageId, options);
  });
}

/**
 * Registers a volume loader that has no data: it throws, so
 * `createAndCacheVolume` rejects. A loader that gives a rejected promise
 * rejects too, but the cache then leaves a second, unhandled rejection.
 */
function registerFailingVolumeLoader() {
  volumeLoader.registerVolumeLoader(FAILING_VOLUME_SCHEME, (volumeId) => {
    throw new Error(`No data for ${volumeId}`);
  });
}

/**
 * The image ids of a series of the size and plane of `series` that is not
 * loaded: its images have metadata and no pixel data in the cache.
 */
function unloadedImageIds(series, id) {
  return series.imageIds.map((imageId) =>
    testUtils.encodeImageIdInfo({
      ...testUtils.decodeImageIdInfo(imageId),
      id,
      name: id,
    })
  );
}

/** The picture of the canvas that the viewport draws on. */
function pictureOf(viewport) {
  const canvases = Array.from(viewport.element.querySelectorAll('canvas'));
  const shown = canvases.find((canvas) => canvas.style.display !== 'none');

  return shown.toDataURL();
}

/** What the viewport shows: its display sets, image, slice and camera. */
function sceneOf(viewport) {
  const camera = viewport.getResolvedView()?.toICamera();

  return {
    displaySets: viewport.getDisplaySets(),
    imageIds: viewport.getImageIds(),
    imageId: viewport.getCurrentImageId(),
    imageIdIndex: viewport.getCurrentImageIdIndex(),
    viewState: JSON.parse(JSON.stringify(viewport.getViewState())),
    camera: {
      focalPoint: [...camera.focalPoint],
      position: [...camera.position],
      viewUp: [...camera.viewUp],
      viewPlaneNormal: [...camera.viewPlaneNormal],
      parallelScale: camera.parallelScale,
    },
  };
}

/** Counts the events of new data of a viewport from now on. */
function countNewDataEvents(viewport) {
  const counter = { newImageSet: 0, newVolume: 0 };

  viewport.element.addEventListener(Events.VIEWPORT_NEW_IMAGE_SET, () => {
    counter.newImageSet++;
  });
  viewport.element.addEventListener(Events.VOLUME_VIEWPORT_NEW_VOLUME, () => {
    counter.newVolume++;
  });

  return counter;
}

/**
 * Registers the two display sets of the replacement in `mode`: `next`, the
 * images of `next` that load, and `failing`, whose load rejects. In stack
 * mode the first image of `failing` does not load; in volume mode its
 * volume does not load.
 */
function registerReplacement(mode, next, failing) {
  const provider = utilities.genericViewportDisplaySetMetadataProvider;

  if (mode === 'stack') {
    provider.add('replacement:next', {
      imageIds: next.imageIds,
      kind: 'planar',
      initialImageIdIndex: 0,
    });
    provider.add('replacement:failing', {
      imageIds: failing,
      kind: 'planar',
      initialImageIdIndex: 0,
    });

    return;
  }

  provider.add('replacement:next', {
    imageIds: next.imageIds,
    volumeId: next.volumeId,
  });
  provider.add('replacement:failing', {
    imageIds: failing,
    volumeId: `${FAILING_VOLUME_SCHEME}:replacement`,
  });
}

describe('A replacement of the display sets of a direct next planar viewport whose second display set does not load -- ', () => {
  let renderingEngine;
  let failingImageIds;
  let stalls;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
    failingImageIds = new Set();
    stalls = new Map();
    registerFailingImageLoader(failingImageIds, stalls);
    registerFailingVolumeLoader();
  });

  afterEach(function () {
    failingImageIds.clear();
    stalls.clear();
    utilities.genericViewportDisplaySetMetadataProvider.clear();
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  for (const mode of ['stack', 'volume']) {
    for (const renderBackend of ['gpu', 'cpu']) {
      it(`rejects and keeps the shown ${mode} on the ${renderBackend.toUpperCase()}, and a later replacement shows`, async function () {
        const shown = await createSeries({
          id: `shown${mode}${renderBackend}`,
        });
        const next = await createSeries({ id: `next${mode}${renderBackend}` });
        const failing = unloadedImageIds(
          shown,
          `failing${mode}${renderBackend}`
        );
        const viewport = createNextViewport(renderingEngine, 'replacement');
        const options = {
          orientation: OrientationAxis.ACQUISITION,
          renderBackend,
        };

        failing.forEach((imageId) => failingImageIds.add(imageId));

        if (mode === 'stack') {
          await showStack(viewport, shown, SHOWN_SLICE, options);
        } else {
          await showVolume(viewport, shown, SHOWN_SLICE, options);
        }

        registerReplacement(mode, next, failing);

        const shownScene = sceneOf(viewport);
        const shownPicture = pictureOf(viewport);
        const newData = countNewDataEvents(viewport);
        let error;

        try {
          await viewport.setDisplaySets(
            { displaySetId: 'replacement:next', options },
            { displaySetId: 'replacement:failing', options }
          );
        } catch (caught) {
          error = caught;
        }

        expect(error).toBeDefined();
        expect(sceneOf(viewport)).toEqual(shownScene);
        expect(newData).toEqual({ newImageSet: 0, newVolume: 0 });

        await renderAndWait(viewport);

        expect(sceneOf(viewport)).toEqual(shownScene);
        expect(pictureOf(viewport)).toBe(shownPicture);

        await viewport.setDisplaySets({
          displaySetId: 'replacement:next',
          options,
        });
        await renderAndWait(viewport);

        expect(viewport.getDisplaySets()).toEqual([
          { displaySetId: 'replacement:next', options: { role: 'source' } },
        ]);
        expect(viewport.getImageIds()).toEqual(next.imageIds);
        expect(newData).toEqual(
          mode === 'stack'
            ? { newImageSet: 1, newVolume: 0 }
            : { newImageSet: 0, newVolume: 1 }
        );
        expect(next.imageIds).toContain(viewport.getCurrentImageId());
      });
    }
  }

  it('keeps the shown stack on the CPU when the image of an older mount that it replaced comes after it rejected', async function () {
    const shown = await createSeries({ id: 'shownOlder' });
    const next = await createSeries({ id: 'nextOlder' });
    const failing = unloadedImageIds(shown, 'failingOlder');
    const older = unloadedImageIds(shown, 'older');
    const viewport = createNextViewport(renderingEngine, 'replacement');
    const options = {
      orientation: OrientationAxis.ACQUISITION,
      renderBackend: 'cpu',
    };
    let releaseOlder;

    failing.forEach((imageId) => failingImageIds.add(imageId));
    stalls.set(
      older[0],
      new Promise((resolve) => {
        releaseOlder = resolve;
      })
    );
    await showStack(viewport, shown, SHOWN_SLICE, options);
    registerReplacement('stack', next, failing);
    utilities.genericViewportDisplaySetMetadataProvider.add(
      'replacement:older',
      { imageIds: older, kind: 'planar', initialImageIdIndex: 0 }
    );

    const shownScene = sceneOf(viewport);
    const shownPicture = pictureOf(viewport);
    const newData = countNewDataEvents(viewport);
    const olderMount = viewport.setDisplaySets({
      displaySetId: 'replacement:older',
      options,
    });
    let error;

    try {
      await viewport.setDisplaySets(
        { displaySetId: 'replacement:next', options },
        { displaySetId: 'replacement:failing', options }
      );
    } catch (caught) {
      error = caught;
    }

    releaseOlder();
    await olderMount;
    await renderAndWait(viewport);

    expect(error).toBeDefined();
    expect(sceneOf(viewport)).toEqual(shownScene);
    expect(pictureOf(viewport)).toBe(shownPicture);
    expect(newData).toEqual({ newImageSet: 0, newVolume: 0 });
  });
});
