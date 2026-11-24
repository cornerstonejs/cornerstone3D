import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { fakeImageLoader } from '../../../utils/test/testUtilsImageLoader';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  waitFor,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, cache, imageLoader, eventTarget } = cornerstone3D;
const { OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const FAILING_SLICE = 3;

/** Resolves after a number of animation frames. */
async function frames(count) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * The image ids of a streaming volume with the images of a series, the image
 * of `FAILING_SLICE` being one that the image loader rejects.
 */
function streamingImageIdsOf(series, name) {
  return series.imageIds.map((_imageId, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name,
      id: name,
      rows: series.size.rows,
      columns: series.size.columns,
      barStart: 0,
      barWidth: 1,
      xSpacing: series.size.columnSpacing,
      ySpacing: series.size.rowSpacing,
      sliceIndex,
      plane: series.plane,
      size: series.size,
    })
  );
}

describe('A streaming volume with an image that fails to load, on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    cornerstone3D.displaySetRegistry.clear();
  });

  it('mounts in volume mode, fires IMAGE_LOAD_FAILED and IMAGE_LOAD_ERROR for that image, ends the load and leaves no unhandled rejection', async function () {
    const series = await createSeries({ id: 'failedImageTemplate' });
    const imageIds = streamingImageIdsOf(series, 'failedImageStream');
    const failingImageId = imageIds[FAILING_SLICE];
    const volumeId = 'cornerstoneStreamingImageVolume:failedImageStream';
    const events = { failed: [], error: [], unhandled: [] };
    const onFailed = (evt) => events.failed.push(evt.detail?.imageId);
    const onError = (evt) => events.error.push(evt.detail?.imageId);
    const onUnhandled = (evt) => {
      events.unhandled.push(String(evt.reason?.message ?? evt.reason));
      evt.preventDefault();
    };

    imageLoader.registerImageLoader('fakeImageLoader', (imageId, options) =>
      imageId === failingImageId
        ? { promise: Promise.reject(new Error('the failing image')) }
        : fakeImageLoader(imageId, options)
    );
    eventTarget.addEventListener(Events.IMAGE_LOAD_FAILED, onFailed);
    eventTarget.addEventListener(Events.IMAGE_LOAD_ERROR, onError);
    window.addEventListener('unhandledrejection', onUnhandled);

    try {
      const viewport = createNextViewport(renderingEngine, 'failedImage');

      cornerstone3D.displaySetRegistry.add('failedImageStream', {
        imageIds,
        volumeId,
      });
      await viewport.setDisplaySets({
        displaySetId: 'failedImageStream',
        options: { orientation: OrientationAxis.ACQUISITION, mode: 'volume' },
      });
      await renderAndWait(viewport);

      const loadEnded = () => {
        const loadStatus = cache.getVolume(volumeId)?.loadStatus;

        return Boolean(loadStatus?.loaded && !loadStatus.loading);
      };

      await waitFor(
        () =>
          events.failed.length > 0 && events.error.length > 0 && loadEnded(),
        5000
      );
      await frames(10);

      expect(viewport.getCurrentMode()).toBe('volume');
      expect([...new Set(events.failed)]).toEqual([failingImageId]);
      expect([...new Set(events.error)]).toEqual([failingImageId]);
      expect(loadEnded()).toBe(true);
      expect(events.unhandled).toEqual([]);
    } finally {
      eventTarget.removeEventListener(Events.IMAGE_LOAD_FAILED, onFailed);
      eventTarget.removeEventListener(Events.IMAGE_LOAD_ERROR, onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });
});
