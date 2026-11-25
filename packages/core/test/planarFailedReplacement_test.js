import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, imageLoader, volumeLoader, cache } = cornerstone3D;
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

/**
 * Counts the DISPLAY_SETS_CHANGED events of a viewport from now on, and those
 * of them that changed the source. A call that fails or that a newer call
 * supersedes fires none.
 */
function countNewDataEvents(viewport) {
  const counter = { displaySetsChanged: 0, sourceChanged: 0 };

  viewport.element.addEventListener(Events.DISPLAY_SETS_CHANGED, (evt) => {
    counter.displaySetsChanged++;
    counter.sourceChanged += evt.detail.sourceChanged ? 1 : 0;
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
  const provider = cornerstone3D.displaySetRegistry;

  if (mode === 'stack') {
    provider.add('replacement:next', {
      imageIds: next.imageIds,
    });
    provider.add('replacement:failing', {
      imageIds: failing,
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
    cornerstone3D.displaySetRegistry.clear();
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
          mode,
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
        expect(newData).toEqual({ displaySetsChanged: 0, sourceChanged: 0 });

        await renderAndWait(viewport);

        expect(sceneOf(viewport)).toEqual(shownScene);
        expect(pictureOf(viewport)).toBe(shownPicture);

        await viewport.setDisplaySets({
          displaySetId: 'replacement:next',
          options,
        });
        await renderAndWait(viewport);

        expect(viewport.getDisplaySets()).toEqual([
          {
            displaySetId: 'replacement:next',
            options: jasmine.objectContaining({ role: 'source' }),
          },
        ]);
        expect(viewport.getImageIds()).toEqual(next.imageIds);
        expect(newData).toEqual({ displaySetsChanged: 1, sourceChanged: 1 });
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
    cornerstone3D.displaySetRegistry.add('replacement:older', {
      imageIds: older,
    });

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
    expect(newData).toEqual({ displaySetsChanged: 0, sourceChanged: 0 });
  });

  for (const renderBackend of ['gpu', 'cpu']) {
    it(`shows the replacement on the ${renderBackend.toUpperCase()} when a NEW_IMAGE listener of its mount starts a replacement that rejects`, async function () {
      const shown = await createSeries({ id: `shownListener${renderBackend}` });
      const next = await createSeries({ id: `nextListener${renderBackend}` });
      const failing = unloadedImageIds(
        shown,
        `failingListener${renderBackend}`
      );
      const viewport = createNextViewport(renderingEngine, 'replacement');
      const options = {
        orientation: OrientationAxis.ACQUISITION,
        renderBackend,
      };

      failing.forEach((imageId) => failingImageIds.add(imageId));
      await showStack(viewport, shown, SHOWN_SLICE, options);
      registerReplacement('stack', next, failing);

      const newData = countNewDataEvents(viewport);
      let failingMount;

      viewport.element.addEventListener(Events.NEW_IMAGE, (event) => {
        if (!failingMount && next.imageIds.includes(event.detail.imageId)) {
          failingMount = viewport.setDisplaySets({
            displaySetId: 'replacement:failing',
            options,
          });
        }
      });
      await viewport.setDisplaySets({
        displaySetId: 'replacement:next',
        options,
      });

      expect(failingMount).toBeDefined();

      let error;

      try {
        await failingMount;
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeDefined();
      expect(viewport.getDisplaySets()).toEqual([
        {
          displaySetId: 'replacement:next',
          options: jasmine.objectContaining({ role: 'source' }),
        },
      ]);
      expect(viewport.getImageIds()).toEqual(next.imageIds);
      expect(viewport.getCurrentImageId()).toBe(next.imageIds[0]);
      expect(newData).toEqual({ displaySetsChanged: 1, sourceChanged: 1 });

      if (!viewport.getDisplaySets().length) {
        return;
      }

      await renderAndWait(viewport);

      const replacementPicture = pictureOf(viewport);

      await viewport.setDisplaySets({
        displaySetId: 'replacement:next',
        options,
      });
      await renderAndWait(viewport);

      expect(pictureOf(viewport)).toBe(replacementPicture);
    });
  }

  it('draws a source and an overlay on the CPU once, with both, when a NEW_IMAGE listener of the mount starts a replacement that rejects at once', async function () {
    const shown = await createSeries({ id: 'shownHold' });
    const next = await createSeries({ id: 'nextHold' });
    const overlay = await createSeries({ id: 'overlayHold' });
    const viewport = createNextViewport(renderingEngine, 'replacement');
    const options = {
      orientation: OrientationAxis.ACQUISITION,
      renderBackend: 'cpu',
    };
    const provider = cornerstone3D.displaySetRegistry;
    const renderedScenes = [];
    let failingMount;
    let counting = false;

    await showStack(viewport, shown, SHOWN_SLICE, options);
    provider.add('replacement:next', {
      imageIds: next.imageIds,
    });
    provider.add('replacement:overlay', {
      imageIds: overlay.imageIds,
    });
    viewport.element.addEventListener(Events.IMAGE_RENDERED, () => {
      if (counting) {
        renderedScenes.push(
          viewport.getDisplaySets().map(({ displaySetId }) => displaySetId)
        );
      }
    });
    viewport.element.addEventListener(Events.NEW_IMAGE, (event) => {
      if (!failingMount && next.imageIds.includes(event.detail.imageId)) {
        failingMount = viewport.setDisplaySets({
          displaySetId: 'replacement:unregistered',
          options,
        });
      }
    });

    counting = true;
    await viewport.setDisplaySets(
      { displaySetId: 'replacement:next', options },
      { displaySetId: 'replacement:overlay', options }
    );
    counting = false;

    let error;

    try {
      await failingMount;
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();
    expect(renderedScenes).toEqual([
      ['replacement:next', 'replacement:overlay'],
    ]);
  });
});

/**
 * Puts a data provider around the one of the viewport. `hold` keeps the loads
 * of a display set waiting until `release`, and `reached` resolves when a held
 * load waits.
 */
function holdDataProvider(viewport) {
  const provider = viewport.dataProvider;
  const gates = new Map();

  viewport.dataProvider = {
    load: async (displaySetId, options) => {
      const gate = gates.get(displaySetId);

      if (gate) {
        gate.markReached();
        await gate.promise;
      }

      return provider.load(displaySetId, options);
    },
  };

  return {
    hold(displaySetId) {
      const gate = {};

      gate.promise = new Promise((resolve) => {
        gate.release = resolve;
      });
      gate.reached = new Promise((resolve) => {
        gate.markReached = resolve;
      });
      gates.set(displaySetId, gate);
    },
    reached(displaySetId) {
      return gates.get(displaySetId).reached;
    },
    release(displaySetId) {
      gates.get(displaySetId).release();
      gates.delete(displaySetId);
    },
  };
}

describe('A replacement of the display sets of a direct next planar viewport whose volume leaves the cache while a later display set loads -- ', () => {
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

  for (const renderBackend of ['gpu', 'cpu']) {
    it(`rejects and keeps the shown volume on the ${renderBackend.toUpperCase()}`, async function () {
      const shown = await createSeries({ id: `evictedShown${renderBackend}` });
      const first = await createSeries({ id: `evictedFirst${renderBackend}` });
      const second = await createSeries({
        id: `evictedSecond${renderBackend}`,
      });
      const viewport = createNextViewport(renderingEngine, 'evicted');
      const options = {
        orientation: OrientationAxis.ACQUISITION,
        renderBackend,
        mode: 'volume',
      };

      await showVolume(viewport, shown, SHOWN_SLICE, options);
      [
        ['evicted:first', first],
        ['evicted:second', second],
      ].forEach(([displaySetId, series]) =>
        cornerstone3D.displaySetRegistry.add(displaySetId, {
          imageIds: series.imageIds,
          volumeId: series.volumeId,
        })
      );

      const provider = holdDataProvider(viewport);
      const shownScene = sceneOf(viewport);
      const shownPicture = pictureOf(viewport);
      const newData = countNewDataEvents(viewport);

      provider.hold('evicted:second');

      const replacement = viewport.setDisplaySets(
        { displaySetId: 'evicted:first', options },
        { displaySetId: 'evicted:second', options }
      );

      await provider.reached('evicted:second');
      cache.removeVolumeLoadObject(first.volumeId);
      expect(cache.getVolume(first.volumeId)).toBeUndefined();
      provider.release('evicted:second');

      let error;

      try {
        await replacement;
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeDefined();
      expect(sceneOf(viewport)).toEqual(shownScene);
      expect(newData).toEqual({ displaySetsChanged: 0, sourceChanged: 0 });

      await renderAndWait(viewport);

      expect(sceneOf(viewport)).toEqual(shownScene);
      expect(pictureOf(viewport)).toBe(shownPicture);
    });
  }
});
