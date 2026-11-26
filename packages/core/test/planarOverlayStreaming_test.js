import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  STRAIGHT_PLANE,
  createNextViewport,
  createSeries,
  renderAndWait,
  waitFor,
} from './utils/planarSeriesBothModes';

const {
  Enums,
  utilities,
  imageLoader,
  volumeLoader,
  cache,
  displaySetRegistry,
  metaData,
  ProgressiveRetrieveImages,
} = cornerstone3D;
const { ImageQualityStatus } = Enums;
const { imageRetrieveMetadataProvider } = utilities;

const renderingEngineId = utilities.uuidv4();

/**
 * The provider of the retrieve configuration. The test environment removes
 * every metadata provider, the one that the module of the configuration adds
 * when it loads too.
 */
const retrieveConfigurationProvider = (type, ...queries) =>
  imageRetrieveMetadataProvider.get(type, ...queries);

/**
 * The window of the streaming series, as the metadata of a PET gives it, so
 * a mount needs no image to choose its VOI and does not wait for the load.
 */
const windowProvider = (type, imageId) =>
  type === 'voiLutModule' &&
  typeof imageId === 'string' &&
  imageId.includes('overlayStream')
    ? { windowCenter: [70], windowWidth: [140] }
    : undefined;

/** A series of 135 frames, as the PET of the M83 study, of 8 by 8 pixels. */
const SIZE = {
  rows: 8,
  columns: 8,
  slices: 135,
  columnSpacing: 1,
  rowSpacing: 1,
  sliceSpacing: 2,
};
const SLICE = 40;

/** The value of every pixel of frame k of the streaming series. */
function frameValue(k) {
  return 1 + k;
}

/** The image ids of a series on the plane of the source, not loaded. */
function seriesImageIds(id) {
  return Array.from({ length: SIZE.slices }, (_, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: id,
      id,
      rows: SIZE.rows,
      columns: SIZE.columns,
      barStart: 0,
      barWidth: 1,
      xSpacing: SIZE.columnSpacing,
      ySpacing: SIZE.rowSpacing,
      sliceIndex,
      plane: STRAIGHT_PLANE,
      size: SIZE,
    })
  );
}

/**
 * Registers an image loader in place of the fake one. An image of `id`
 * holds `frameValue` of its frame in every pixel, and comes when the test
 * opens it, in the order of the requests: the order of the interleaved
 * stages. Every other image loads at once.
 */
function registerGatedLoader(id) {
  const requests = [];

  imageLoader.registerImageLoader('fakeImageLoader', (imageId, options) => {
    const info = testUtils.decodeImageIdInfo(imageId);
    const load = () =>
      testUtils.fakeImageLoader(imageId, options).promise.then((image) => {
        if (info.id === id) {
          image.voxelManager.getScalarData().fill(frameValue(info.sliceIndex));
        }

        return image;
      });

    if (info.id !== id) {
      return { promise: load() };
    }

    let open;
    const gate = new Promise((resolve) => {
      open = resolve;
    });

    requests.push({ sliceIndex: info.sliceIndex, open });

    return { promise: gate.then(load) };
  });

  return requests;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The actor entry of a display set of a viewport. */
function actorOf(viewport, displaySetId) {
  return viewport
    .getActors()
    .find((entry) => entry.displaySetId === displaySetId)?.actor;
}

/** The values that the sampled slice of an actor holds. */
function slicePixels(actor) {
  return Array.from(
    actor.getMapper().getInputData().getPointData().getScalars().getData()
  );
}

/**
 * Mounts a source that is loaded on its slice SLICE with a streaming volume
 * as its overlay, and a second viewport with the streaming volume as its
 * source, and opens the requests of the streaming volume a few at a time.
 * After each step, `check` gets the viewports and whether the frame SLICE
 * holds its own data.
 */
async function streamOverlay(renderingEngine, id, overlayOptions, check) {
  const source = await createSeries({ id: `${id}Source`, size: SIZE });
  const requests = registerGatedLoader(id);
  const imageIds = seriesImageIds(id);
  const volumeId = `cornerstoneStreamingImageVolume:${id}`;

  imageRetrieveMetadataProvider.add('volume', {
    ...ProgressiveRetrieveImages.coarseInterleavedRetrieveStages,
    retrieveOptions: { default: {} },
  });
  await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  displaySetRegistry.add(`${id}Source`, {
    imageIds: source.imageIds,
    volumeId: source.volumeId,
  });
  displaySetRegistry.add(id, { imageIds, volumeId });

  const fused = createNextViewport(renderingEngine, `${id}Fused`);
  const alone = createNextViewport(renderingEngine, `${id}Alone`);
  const volume = cache.getVolume(volumeId);
  let mounted = false;
  let opened = 0;
  const steps = (async () => {
    while (!volume.loadStatus.loaded || !mounted) {
      await waitFor(
        () => requests.length > opened || (volume.loadStatus.loaded && mounted),
        8000
      );

      const batch = requests.slice(opened, opened + 3);

      batch.forEach((request) => request.open());
      opened += batch.length;
      await sleep(140);

      if (mounted) {
        await renderAndWait(fused);
        await renderAndWait(alone);
        check({
          fused,
          alone,
          ownFrame:
            volume.getImageQuality(SLICE) >= ImageQualityStatus.SUBRESOLUTION,
        });
      }
    }
  })();

  await fused.setDisplaySets(
    {
      displaySetId: `${id}Source`,
      options: { mode: 'volume', initialImageIdIndex: SLICE },
    },
    {
      displaySetId: id,
      options: { mode: 'volume', role: 'overlay', ...overlayOptions },
    }
  );
  await alone.setDisplaySets({
    displaySetId: id,
    options: { mode: 'volume', initialImageIdIndex: SLICE },
  });
  mounted = true;
  await steps;
  await sleep(140);
  await renderAndWait(fused);
  await renderAndWait(alone);

  return { fused, alone, volume };
}

describe('An overlay of a volume that streams with the interleaved stages -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    metaData.addProvider(retrieveConfigurationProvider, 30000);
    metaData.addProvider(windowProvider, 30000);
  });

  afterEach(function () {
    metaData.removeProvider(retrieveConfigurationProvider);
    metaData.removeProvider(windowProvider);
    imageRetrieveMetadataProvider.clear();
    imageLoader.registerImageLoader(
      'fakeImageLoader',
      testUtils.fakeImageLoader
    );
    displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('shows nothing or the frame on the plane of the source on the sampled slice path, never a copy of another frame, and the source alone keeps its coarse preview', async function () {
    const shown = [];
    let previewSeen = false;
    const { fused, alone } = await streamOverlay(
      renderingEngine,
      'overlayStreamCpu',
      {},
      ({ fused, alone, ownFrame }) => {
        const overlay = actorOf(fused, 'overlayStreamCpu');
        const pixels = overlay.getVisibility() ? slicePixels(overlay) : [];
        const alonePixels = slicePixels(actorOf(alone, 'overlayStreamCpu'));

        shown.push({ ownFrame, visible: overlay.getVisibility(), pixels });
        previewSeen ||=
          !ownFrame &&
          alonePixels.some(
            (value) => value > 0 && Math.abs(value - frameValue(SLICE)) > 0.5
          );
      }
    );

    shown.forEach(({ ownFrame, visible, pixels }) => {
      if (!ownFrame) {
        expect(visible).toBe(false);
      }

      pixels.forEach((value) =>
        expect(value).toBeCloseTo(frameValue(SLICE), 3)
      );
    });

    const firstOwn = shown.findIndex(({ ownFrame }) => ownFrame);

    expect(firstOwn).toBeGreaterThan(0);
    shown.slice(firstOwn).forEach(({ visible }) => expect(visible).toBe(true));
    expect(previewSeen).toBe(true);

    const overlay = actorOf(fused, 'overlayStreamCpu');

    expect(
      fused.getRenderPlan().find(({ role }) => role === 'overlay').slice
    ).toBe('cpu');
    expect(overlay.getVisibility()).toBe(true);
    slicePixels(overlay).forEach((value) =>
      expect(value).toBeCloseTo(frameValue(SLICE), 3)
    );
    slicePixels(actorOf(alone, 'overlayStreamCpu')).forEach((value) =>
      expect(value).toBeCloseTo(frameValue(SLICE), 3)
    );
  }, 60000);

  it('hides the slice of the GPU volume path until the frame on the plane of the source has its own data', async function () {
    const shown = [];
    const { fused } = await streamOverlay(
      renderingEngine,
      'overlayStreamGpu',
      { sliceFirst: false },
      ({ fused, ownFrame }) =>
        shown.push({
          ownFrame,
          visible: actorOf(fused, 'overlayStreamGpu').getVisibility(),
        })
    );

    expect(
      fused.getRenderPlan().find(({ role }) => role === 'overlay').slice
    ).toBe('gpuVolume');
    shown.forEach(({ ownFrame, visible }) => expect(visible).toBe(ownFrame));
    expect(actorOf(fused, 'overlayStreamGpu').getVisibility()).toBe(true);
  }, 60000);
});
