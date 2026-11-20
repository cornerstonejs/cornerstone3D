import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  storedValue,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, cache } = cornerstone3D;
const { OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The slice of a test series that the tests show. */
const SLICE = 3;

/**
 * Shows one series as a stack on one direct next viewport and as a volume
 * in its acquisition orientation on another, both at the slice `SLICE`.
 */
async function showBothModes(renderingEngine, series) {
  const stack = createNextViewport(renderingEngine, 'stack');
  const volume = createNextViewport(renderingEngine, 'volume');

  await showStack(stack, series, SLICE);
  await showVolume(volume, series, SLICE);

  return { stack, volume };
}

describe('What a caller uses in place of cut planar members, in stack mode and in volume mode -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  describe('cache.getImage(viewport.getCurrentImageId()), in place of getCornerstoneImage', () => {
    it('gives the image of the slice on display, for a stack and for a volume in its acquisition orientation', async function () {
      const series = await createSeries();
      const { stack, volume } = await showBothModes(renderingEngine, series);

      [stack, volume].forEach((viewport) => {
        const image = cache.getImage(viewport.getCurrentImageId());

        expect(viewport.getCurrentImageId()).toBe(series.imageIds[SLICE]);
        expect(image.imageId).toBe(series.imageIds[SLICE]);
        expect(image.voxelManager.getAtIJK(5, 7, 0)).toBe(
          storedValue([5, 7, SLICE])
        );
      });
    });

    it('has no image for a volume view that is not in the acquisition orientation: the image id is undefined', async function () {
      const series = await createSeries();
      const viewport = createNextViewport(renderingEngine, 'volume');

      await showVolume(viewport, series, SLICE, {
        orientation: OrientationAxis.SAGITTAL,
      });

      expect(viewport.getCurrentMode()).toBe('volume');
      expect(viewport.getCurrentImageId()).toBeUndefined();
    });

    it('carries the image in the detail of NEW_IMAGE in stack mode, and no image in volume mode', async function () {
      const series = await createSeries();
      const { stack, volume } = await showBothModes(renderingEngine, series);
      const details = {};

      for (const viewport of [stack, volume]) {
        const shown = new Promise((resolve) => {
          viewport.element.addEventListener(
            Events.NEW_IMAGE,
            (evt) => resolve(evt.detail),
            { once: true }
          );
        });

        await viewport.scroll(1);
        details[viewport.id] = await shown;
        await renderAndWait(viewport);
      }

      expect(details.stack.image).toBe(
        cache.getImage(stack.getCurrentImageId())
      );
      expect(details.stack.imageId).toBe(stack.getCurrentImageId());
      expect(details.stack.imageIdIndex).toBe(stack.getCurrentImageIdIndex());
      expect(details.stack.numberOfSlices).toBe(stack.getNumberOfSlices());
      expect(details.volume.image).toBeUndefined();
      expect(details.volume.imageId).toBe(volume.getCurrentImageId());
      expect(details.volume.imageIdIndex).toBe(volume.getCurrentImageIdIndex());
      expect(details.volume.numberOfSlices).toBe(volume.getNumberOfSlices());
    });
  });

  describe('getCurrentMode, getVolumeId and hasVolumeId, in place of getAllVolumeIds', () => {
    it('say what is mounted, for a stack, for a volume and for nothing', async function () {
      const series = await createSeries();
      const { stack, volume } = await showBothModes(renderingEngine, series);
      const empty = createNextViewport(renderingEngine, 'empty');

      expect(stack.getCurrentMode()).toBe('stack');
      expect(stack.hasVolumeId(series.volumeId)).toBe(false);
      expect(stack.getVolumeId()).toBeUndefined();

      expect(volume.getCurrentMode()).toBe('volume');
      expect(volume.getVolumeId()).toBe(series.volumeId);
      expect(volume.hasVolumeId(series.volumeId)).toBe(true);
      expect(volume.hasVolumeId('anotherVolume')).toBe(false);

      expect(empty.getCurrentMode()).toBe('empty');
      expect(empty.getVolumeId()).toBeUndefined();
      expect(empty.hasVolumeId(series.volumeId)).toBe(false);
    });

    it('claim no volume in stack mode, also not the id that the images would get as a volume', async function () {
      const series = await createSeries();
      const { stack } = await showBothModes(renderingEngine, series);
      const idOfTheImages = cache.generateVolumeId(series.imageIds);

      expect(stack.getCurrentMode()).toBe('stack');
      expect(stack.getVolumeId()).toBeUndefined();
      expect(stack.hasVolumeId(idOfTheImages)).toBe(false);
      expect(stack.hasVolumeURI(idOfTheImages)).toBe(false);
      expect(cache.getVolume(idOfTheImages)).toBeUndefined();
    });

    it('give the volume id asked for only when the viewport shows that volume, as the legacy volume viewport', async function () {
      const series = await createSeries();
      const { stack, volume } = await showBothModes(renderingEngine, series);

      expect(volume.getVolumeId({ volumeId: series.volumeId })).toBe(
        series.volumeId
      );
      expect(volume.getVolumeId({ volumeId: 'anotherVolume' })).toBeUndefined();
      expect(stack.getVolumeId({ volumeId: 'anotherVolume' })).toBeUndefined();
    });

    it('find the URI of every volume on display with hasVolumeURI, also of an overlay, as the legacy volume viewport', async function () {
      const source = await createSeries({ id: 'uriSource' });
      const overlay = await createSeries({ id: 'uriOverlay' });
      const fused = createNextViewport(renderingEngine, 'fused');
      const empty = createNextViewport(renderingEngine, 'emptyURI');
      const options = { orientation: OrientationAxis.ACQUISITION };

      [
        ['uri:source', source],
        ['uri:overlay', overlay],
      ].forEach(([displaySetId, series]) =>
        utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
          imageIds: series.imageIds,
          volumeId: series.volumeId,
        })
      );
      await fused.setDisplaySets(
        { displaySetId: 'uri:source', options },
        { displaySetId: 'uri:overlay', options }
      );
      await renderAndWait(fused);

      expect(fused.getCurrentMode()).toBe('volume');
      expect(fused.getVolumeId()).toBe(source.volumeId);
      expect(fused.hasVolumeURI('uriSource')).toBe(true);
      expect(fused.hasVolumeURI('uriOverlay')).toBe(true);
      expect(fused.hasVolumeURI('anotherVolume')).toBe(false);
      expect(empty.hasVolumeURI('')).toBe(false);
    });
  });

  describe('getCurrentVolumeViewportSlice(viewport).scalarData, in place of getCurrentSlicePixelData', () => {
    it('gives the pixels of the slice on display, the same for a stack and for a volume', async function () {
      const series = await createSeries();
      const { stack, volume } = await showBothModes(renderingEngine, series);
      const { columns, rows } = series.size;
      const [stackSlice, volumeSlice] = [stack, volume].map((viewport) =>
        utilities.getCurrentVolumeViewportSlice(viewport)
      );
      const expected = [];

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < columns; i++) {
          expected.push(storedValue([i, j, SLICE]));
        }
      }

      expect(Array.from(stackSlice.scalarData)).toEqual(expected);
      expect(Array.from(volumeSlice.scalarData)).toEqual(expected);
    });
  });

  describe('viewport.getImageData().scaling, in place of scaling', () => {
    /**
     * Gives the volume of a PT series the scaling that a streaming volume
     * takes from the scaling module when it loads its frames. The volume of
     * the test series is made of cached images, so nothing loads.
     */
    function addStreamingScaling(series) {
      const { suvbw, suvlbm, suvbsa } = cornerstone3D.metaData.get(
        'scalingModule',
        series.imageIds[0]
      );

      cache.getVolume(series.volumeId).scaling = {
        PT: {
          suvbwToSuvlbm: suvlbm / suvbw,
          suvbwToSuvbsa: suvbsa / suvbw,
          suvbw,
        },
      };
    }

    it('gives the PT scaling of the data on display, for a stack and for a volume', async function () {
      const series = await createSeries({ id: 'ptSeries', info: { PT: true } });

      addStreamingScaling(series);

      const { stack, volume } = await showBothModes(renderingEngine, series);
      const ratios = { suvbwToSuvlbm: 1, suvbwToSuvbsa: 1 };

      expect(stack.getImageData().scaling.PT).toEqual(
        jasmine.objectContaining(ratios)
      );
      expect(volume.getImageData().scaling.PT).toEqual(
        jasmine.objectContaining(ratios)
      );
    });

    it('gives the PT scaling of a stack on the CPU path as on the GPU path', async function () {
      const series = await createSeries({
        id: 'ptSeriesCpu',
        info: { PT: true },
      });
      const gpu = createNextViewport(renderingEngine, 'gpu');
      const cpu = createNextViewport(renderingEngine, 'cpu');

      await showStack(gpu, series, SLICE);
      await showStack(cpu, series, SLICE, { renderBackend: 'cpu' });

      expect(cpu.getImageData().scaling).toEqual(gpu.getImageData().scaling);
      expect(cpu.getImageData().scaling.PT.suvbwToSuvlbm).toBe(1);
    });

    it('gives no PT scaling for data that is not PT, for a stack and for a volume', async function () {
      const series = await createSeries();
      const { stack, volume } = await showBothModes(renderingEngine, series);

      expect(stack.getImageData().scaling?.PT).toBeUndefined();
      expect(volume.getImageData().scaling?.PT).toBeUndefined();
    });
  });
});
