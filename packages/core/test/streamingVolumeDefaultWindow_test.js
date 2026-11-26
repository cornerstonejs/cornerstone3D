import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  STRAIGHT_PLANE,
  createNextViewport,
  createSeries,
  waitFor,
} from './utils/planarSeriesBothModes';

const {
  utilities,
  imageLoader,
  volumeLoader,
  cache,
  displaySetRegistry,
  metaData,
  ProgressiveRetrieveImages,
} = cornerstone3D;
const { imageRetrieveMetadataProvider } = utilities;

const renderingEngineId = utilities.uuidv4();

/**
 * Row 288 of `v6-open-issues.md`: a planar mount of a streaming volume whose
 * metadata gives no window reads its default window from the middle image.
 * That image came from a second request, made after every request of the
 * retrieve stages, so the mount waited for the whole load. The window now
 * reads the request of the volume itself, which the stages make first, and
 * the mount settles once that image is there.
 */

const retrieveConfigurationProvider = (type, ...queries) =>
  imageRetrieveMetadataProvider.get(type, ...queries);

function sizeOf(slices) {
  return {
    rows: 8,
    columns: 8,
    slices,
    columnSpacing: 1,
    rowSpacing: 1,
    sliceSpacing: 2,
  };
}

function seriesImageIds(id, size) {
  return Array.from({ length: size.slices }, (_, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: id,
      id,
      rows: size.rows,
      columns: size.columns,
      barStart: 0,
      barWidth: 1,
      xSpacing: size.columnSpacing,
      ySpacing: size.rowSpacing,
      sliceIndex,
      plane: STRAIGHT_PLANE,
      size,
    })
  );
}

/**
 * A loader of the images of `id` that counts the requests of each image and
 * answers them one at a time, in the order they were made, as a server that
 * sends one image after the other. Every other image loads at once.
 */
function registerCountingLoader(id) {
  const requests = [];

  imageLoader.registerImageLoader('fakeImageLoader', (imageId, options) => {
    const info = testUtils.decodeImageIdInfo(imageId);
    const load = () => testUtils.fakeImageLoader(imageId, options).promise;

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

/**
 * Mounts the streaming volume of `slices` frames with `mount`, answers its
 * requests one by one, and gives how many were answered when the mount
 * settled and how often the middle image was requested.
 */
async function measureMount(renderingEngine, id, slices, mount) {
  const size = sizeOf(slices);
  const requests = registerCountingLoader(id);
  const imageIds = seriesImageIds(id, size);
  const volumeId = `cornerstoneStreamingImageVolume:${id}`;

  imageRetrieveMetadataProvider.add('volume', {
    ...ProgressiveRetrieveImages.coarseInterleavedRetrieveStages,
    retrieveOptions: { default: {} },
  });
  await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  displaySetRegistry.add(id, { imageIds, volumeId });

  const viewport = createNextViewport(renderingEngine, `${id}Viewport`);
  const volume = cache.getVolume(volumeId);
  let answeredAtMount;
  let answered = 0;
  const mounting = mount(viewport, size).then(() => {
    answeredAtMount = answered;
  });

  while (answeredAtMount === undefined || !volume.loadStatus.loaded) {
    await waitFor(
      () =>
        requests.length > answered ||
        (answeredAtMount !== undefined && volume.loadStatus.loaded),
      8000
    );

    if (requests.length > answered) {
      requests[answered].open();
      answered++;
    }

    await sleep(2);
  }

  await mounting;

  const middle = Math.floor(slices / 2);

  return {
    answeredAtMount,
    middleRequests: requests.filter(({ sliceIndex }) => sliceIndex === middle)
      .length,
    total: requests.length,
  };
}

describe('A planar mount of a streaming volume without a window in its metadata -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    metaData.addProvider(retrieveConfigurationProvider, 30000);
  });

  afterEach(function () {
    metaData.removeProvider(retrieveConfigurationProvider);
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

  [135, 134].forEach((slices) => {
    it(`settles as a source once the middle image of ${slices} is there, which is requested once and first`, async function () {
      const measured = await measureMount(
        renderingEngine,
        `defaultWindowSource${slices}`,
        slices,
        (viewport) =>
          viewport.setDisplaySets({
            displaySetId: `defaultWindowSource${slices}`,
            options: { mode: 'volume', initialImageIdIndex: 40 },
          })
      );

      expect(measured.middleRequests).toBe(1);
      expect(measured.total).toBe(slices);
      expect(measured.answeredAtMount).toBeLessThanOrEqual(2);
    });
  });

  it('settles as an overlay over a loaded source once the middle image is there', async function () {
    const source = await createSeries({
      id: 'defaultWindowOverlaySource',
      size: sizeOf(135),
    });

    displaySetRegistry.add('defaultWindowOverlaySource', {
      imageIds: source.imageIds,
      volumeId: source.volumeId,
    });

    const measured = await measureMount(
      renderingEngine,
      'defaultWindowOverlay',
      135,
      (viewport) =>
        viewport.setDisplaySets(
          {
            displaySetId: 'defaultWindowOverlaySource',
            options: { mode: 'volume', initialImageIdIndex: 40 },
          },
          {
            displaySetId: 'defaultWindowOverlay',
            options: { mode: 'volume', role: 'overlay' },
          }
        )
    );

    expect(measured.middleRequests).toBe(1);
    expect(measured.answeredAtMount).toBeLessThanOrEqual(2);
  });
});
