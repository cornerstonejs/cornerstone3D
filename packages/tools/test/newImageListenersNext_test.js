import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  waitFor,
} from '../../core/test/utils/planarSeriesBothModes';
import { getToolState } from '../src/utilities/stackPrefetch/state';
import { getLabelmapActorEntries } from '../src/stateManagement/segmentation/helpers/getSegmentationActor';
import {
  createNextPlanarViewport,
  showStackWithLabelmap,
} from './nextLabelmapScenes';

const { cache, utilities, Enums } = cornerstone3D;
const { Events } = Enums;
const { segmentation, synchronizers, SynchronizerManager } = csTools3d;
const { stackPrefetch, stackContextPrefetch } = csTools3d.utilities;
const { ViewportColorbar } = csTools3d.utilities.voi.colorbar;

const renderingEngineId = utilities.uuidv4();
const synchronizerId = 'imageSliceOfNewImage';

/** The two ways a series shows on a direct next planar viewport. */
const MODES = [
  ['stack', showStack],
  ['volume', showVolume],
];

/**
 * The image ids of a stack of 8 images of the fake image loader, 1 mm apart.
 * No image is loaded, so a prefetch has images to load.
 */
function createUnloadedImageIds(name) {
  return Array.from({ length: 8 }, (_, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name,
      id: name,
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

/** Shows a stack of image ids on a direct next viewport, at its image 0. */
async function showImageIds(viewport, imageIds) {
  const displaySetId = `stack:${viewport.id}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { initialImageIdIndex: 0 },
  });
  await renderAndWait(viewport);
}

/** Goes to an image index and resolves when the element fires NEW_IMAGE. */
function showImage(viewport, imageIdIndex) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.NEW_IMAGE, resolve, {
      once: true,
    });
    viewport.setImageIdIndex(imageIdIndex);
  });
}

/** The indices of the images of a stack that the cache holds. */
function loadedIndices(imageIds) {
  return imageIds
    .map((imageId, index) => (cache.isLoaded(imageId) ? index : undefined))
    .filter((index) => index !== undefined);
}

describe('The listeners of NEW_IMAGE on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    SynchronizerManager.destroySynchronizer(synchronizerId);
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  describe('the stack prefetch', () => {
    let configuration;

    beforeEach(function () {
      configuration = stackPrefetch.getConfiguration();
      stackPrefetch.setConfiguration({
        ...configuration,
        maxImagesToPrefetch: 1,
      });
    });

    afterEach(function () {
      stackPrefetch.setConfiguration(configuration);
    });

    it('starts again around a new image of a stack', async function () {
      const imageIds = createUnloadedImageIds('prefetchNewImage');
      const viewport = createNextViewport(renderingEngine, 'prefetch');

      await showImageIds(viewport, imageIds);
      stackPrefetch.enable(viewport.element);
      await waitFor(() => cache.isLoaded(imageIds[1]));

      expect(viewport.getCurrentMode()).toBe('stack');
      expect(loadedIndices(imageIds)).toEqual([0, 1]);

      await showImage(viewport, 5);
      await waitFor(
        () => cache.isLoaded(imageIds[4]) && cache.isLoaded(imageIds[6])
      );

      expect(loadedIndices(imageIds)).toEqual([0, 1, 4, 5, 6]);
      stackPrefetch.disable(viewport.element);
    });
  });

  describe('the stack context prefetch', () => {
    /**
     * Registers an image loader in place of the fake one that records each
     * prefetch load and holds it until `release`. A prefetch that never ends
     * never fills the cache on its own, so only a new image starts another.
     */
    function holdPrefetchLoads() {
      const requested = [];
      const held = [];

      cornerstone3D.imageLoader.registerImageLoader(
        'fakeImageLoader',
        (imageId, options = {}) => {
          if (options.requestType !== Enums.RequestType.Prefetch) {
            return testUtils.fakeImageLoader(imageId, options);
          }

          requested.push(imageId);

          return {
            promise: new Promise((resolve) => held.push(resolve)).then(
              () => testUtils.fakeImageLoader(imageId, options).promise
            ),
          };
        }
      );

      return {
        requested,
        release: () => held.splice(0).forEach((resolve) => resolve()),
      };
    }

    it('prefetches around a new image of a stack', async function () {
      const imageIds = createUnloadedImageIds('contextPrefetchNewImage');
      const viewport = createNextViewport(renderingEngine, 'contextPrefetch');
      const loads = holdPrefetchLoads();
      const requestedIndices = () =>
        loads.requested.map((imageId) => imageIds.indexOf(imageId)).sort();

      await showImageIds(viewport, imageIds);
      stackContextPrefetch.enable(viewport.element);
      await waitFor(() => loads.requested.length === 2);

      expect(viewport.getCurrentMode()).toBe('stack');
      expect(requestedIndices()).toEqual([1, 2]);

      await showImage(viewport, 5);
      await waitFor(() => loads.requested.length === 6);

      expect(requestedIndices()).toEqual([1, 2, 3, 4, 6, 7]);
      expect(getToolState(viewport.element).currentImageIdIndex).toBe(5);
      stackContextPrefetch.disable(viewport.element);
      loads.release();
    });
  });

  describe('the image slice synchronizer', () => {
    for (const [mode, show] of MODES) {
      it(`moves its target to the image of its source in ${mode} mode`, async function () {
        const series = await createSeries({ id: `slice-sync-${mode}` });
        const source = createNextViewport(renderingEngine, 'source');
        const target = createNextViewport(renderingEngine, 'target');

        await show(source, series, 2);
        await show(target, series, 2);

        const synchronizer =
          synchronizers.createImageSliceSynchronizer(synchronizerId);

        synchronizer.add({ renderingEngineId, viewportId: 'source' });
        synchronizer.add({ renderingEngineId, viewportId: 'target' });

        expect(source.getCurrentMode()).toBe(mode);
        expect(target.getCurrentMode()).toBe(mode);
        expect(target.getCurrentImageId()).toBe(series.imageIds[2]);

        const shown = [];

        while (shown.length < 2) {
          const imageIdIndex = source.getCurrentImageIdIndex();

          await source.scroll(1);
          await waitFor(
            () => source.getCurrentImageIdIndex() === imageIdIndex + 1
          );
          await waitFor(
            () => target.getCurrentImageId() === source.getCurrentImageId()
          );

          expect(target.getCurrentImageIdIndex()).toBe(imageIdIndex + 1);
          expect(series.imageIds).toContain(target.getCurrentImageId());
          expect(shown).not.toContain(target.getCurrentImageId());
          shown.push(target.getCurrentImageId());
        }

        expect(shown).not.toContain(series.imageIds[2]);
      });
    }
  });

  describe('the labelmap of a stack', () => {
    it('follows a new image of the stack, as the legacy stack viewport did through PRE_STACK_NEW_IMAGE', async function () {
      const segmentationId = 'labelmapOfNewImage';
      const viewport = createNextPlanarViewport(renderingEngine, 'labelmap');
      const { imageIds } = await showStackWithLabelmap(
        viewport,
        segmentationId
      );
      const labelmapImageIds =
        segmentation.state.getSegmentation(segmentationId).representationData
          .Labelmap.imageIds;
      const referencedIds = () =>
        (getLabelmapActorEntries(viewport.id, segmentationId) ?? []).map(
          ({ referencedId }) => referencedId
        );

      expect(viewport.getCurrentMode()).toBe('stack');
      expect(referencedIds()).toEqual([labelmapImageIds[1]]);

      await showImage(viewport, 2);
      await waitFor(() => referencedIds().includes(labelmapImageIds[2]));

      expect(viewport.getCurrentImageId()).toBe(imageIds[2]);
      expect(referencedIds()).toEqual([labelmapImageIds[2]]);
    });
  });

  describe('the colorbar of a viewport', () => {
    /** Adds a colorbar for the viewport and gives it with its container. */
    function addColorbar(viewport) {
      const container = document.createElement('div');

      container.style.width = '20px';
      container.style.height = '200px';
      document.body.appendChild(container);

      const colorbar = new ViewportColorbar({
        id: `colorbar:${viewport.id}`,
        element: viewport.element,
        container,
        colormaps: [{ Name: 'Grayscale', RGBPoints: [0, 0, 0, 0, 1, 1, 1, 1] }],
        activeColormapName: 'Grayscale',
      });

      return { colorbar, container };
    }

    for (const [mode, show] of MODES) {
      it(`reads the image range again for a new image in ${mode} mode`, async function () {
        const series = await createSeries({ id: `colorbar-${mode}` });
        const viewport = createNextViewport(renderingEngine, 'colorbar');

        await show(viewport, series, 2);

        const { colorbar, container } = addColorbar(viewport);
        const rangeOfMount = colorbar.imageRange;
        const imageIdIndex = viewport.getCurrentImageIdIndex();

        colorbar.imageRange = { lower: -5, upper: 5 };
        await viewport.scroll(1);
        await waitFor(
          () => viewport.getCurrentImageIdIndex() === imageIdIndex + 1
        );
        await waitFor(() => colorbar.imageRange.lower !== -5);

        expect(viewport.getCurrentMode()).toBe(mode);
        expect(rangeOfMount.upper).toBeGreaterThan(rangeOfMount.lower);
        expect(colorbar.imageRange.upper).toBeGreaterThan(
          colorbar.imageRange.lower
        );
        expect(colorbar.imageRange.upper).toBeGreaterThan(5);

        colorbar.destroy();
        colorbar.imageRange = { lower: -5, upper: 5 };
        await viewport.scroll(1);
        await waitFor(
          () => viewport.getCurrentImageIdIndex() === imageIdIndex + 2
        );
        await renderAndWait(viewport);

        expect(colorbar.imageRange).toEqual({ lower: -5, upper: 5 });
        container.remove();
      });
    }
  });
});
