import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events, BlendModes } = Enums;

const renderingEngineId = utilities.uuidv4();
const SIZE = 120;
const PLANE_DISTANCE = 7;
const VOI_RANGE = { lower: 0, upper: 255 };

/**
 * Makes and caches a volume of 21 by 21 by 41 voxels of 1 mm. Every voxel is
 * 0 but one plane of 255 that lies `PLANE_DISTANCE` slices above the middle
 * slice, so a slab around the middle slice shows the plane only when it
 * reaches that far.
 */
async function createPlaneVolume() {
  const middle = 20;
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURIExact',
    id: 'slabPlane',
    rows: 21,
    columns: 21,
    slices: 41,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
    exactRegion: {
      startRow: 0,
      endRow: 21,
      startColumn: 0,
      endColumn: 21,
      startSlice: middle + PLANE_DISTANCE,
      endSlice: middle + PLANE_DISTANCE + 1,
      value: 255,
    },
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

/**
 * Makes a legacy volume viewport, a planar legacy adapter and a direct next
 * planar viewport, all axial and of one size, in one rendering engine.
 */
function createViewports(renderingEngine) {
  const options = {
    orientation: OrientationAxis.AXIAL,
    width: SIZE,
    height: SIZE,
    background: [0, 0, 0],
    useEnableElement: true,
  };

  testUtils.createViewports(renderingEngine, {
    ...options,
    viewportId: 'legacy',
    viewportType: ViewportType.ORTHOGRAPHIC,
  });
  testUtils.createViewports(renderingEngine, {
    ...options,
    viewportId: 'adapter',
    viewportType: ViewportType.ORTHOGRAPHIC,
  });
  testUtils.createViewports(renderingEngine, {
    ...options,
    viewportId: 'next',
    viewportType: ViewportType.PLANAR_NEXT,
  });

  return ['legacy', 'adapter', 'next'].map((id) =>
    renderingEngine.getViewport(id)
  );
}

/** Shows the volume on a direct next planar viewport through a display set. */
async function showVolumeOnNext(viewport, volumeId) {
  const displaySetId = `slab:${viewport.id}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.AXIAL },
  });
  viewport.setDisplaySetPresentation(displaySetId, { voiRange: VOI_RANGE });

  return displaySetId;
}

/**
 * Renders the viewport and waits for its IMAGE_RENDERED event, or for half a
 * second when no event comes.
 */
function renderAndWait(viewport) {
  return new Promise((resolve) => {
    const finish = () => {
      viewport.element.removeEventListener(Events.IMAGE_RENDERED, finish);
      clearTimeout(timer);
      setTimeout(resolve, 30);
    };
    const timer = setTimeout(finish, 500);

    viewport.element.addEventListener(Events.IMAGE_RENDERED, finish);
    viewport.render();
  });
}

/** The pixels of the canvas of the viewport, as RGBA bytes. */
function readPixels(viewport) {
  const source = viewport.getCanvas();
  const canvas = document.createElement('canvas');

  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d').drawImage(source, 0, 0);

  return canvas
    .getContext('2d')
    .getImageData(0, 0, source.width, source.height);
}

/** The red value of the pixel in the middle of the canvas of the viewport. */
function readMiddlePixel(viewport) {
  const { data, width, height } = readPixels(viewport);
  const middle = Math.floor(height / 2) * width + Math.floor(width / 2);

  return data[middle * 4];
}

/** The largest difference of one colour value between two pictures. */
function getLargestDifference(first, second) {
  let largest = 0;

  for (let index = 0; index < first.data.length; index++) {
    if (index % 4 !== 3) {
      largest = Math.max(
        largest,
        Math.abs(first.data[index] - second.data[index])
      );
    }
  }

  return largest;
}

/**
 * Sets a slab of the blend mode and thickness on a legacy viewport or an
 * adapter through the legacy API, renders it and reads the middle pixel.
 */
async function drawLegacySlab(viewport, blendMode, slabThickness) {
  viewport.setBlendMode(blendMode);
  viewport.setSlabThickness(slabThickness);
  await renderAndWait(viewport);

  return readMiddlePixel(viewport);
}

/**
 * Sets a slab of the blend mode and thickness on a direct next viewport
 * through the presentation of its display set, renders it and reads the
 * middle pixel.
 */
async function drawNextSlab(viewport, displaySetId, blendMode, slabThickness) {
  viewport.setDisplaySetPresentation(displaySetId, {
    blendMode,
    slabThickness,
  });
  await renderAndWait(viewport);

  return readMiddlePixel(viewport);
}

describe('Planar slab thickness against the legacy volume viewport -- ', () => {
  let renderingEngine;
  let legacy;
  let adapter;
  let next;
  let displaySetId;

  beforeEach(async function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;
    [legacy, adapter, next] = createViewports(renderingEngine);

    const volumeId = await createPlaneVolume();

    for (const viewport of [legacy, adapter]) {
      await viewport.setVolumes([{ volumeId }]);
      viewport.setProperties({ voiRange: VOI_RANGE });
    }

    displaySetId = await showVolumeOnNext(next, volumeId);
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('measures where a plane at a known distance starts to show', async function () {
    const thicknesses = [4, 6, 6.5, 7, 7.5, 8, 10, 12, 14, 16, 20];
    const rows = [];

    for (const blendMode of [
      BlendModes.MAXIMUM_INTENSITY_BLEND,
      BlendModes.AVERAGE_INTENSITY_BLEND,
    ]) {
      for (const slabThickness of thicknesses) {
        rows.push({
          blendMode,
          slabThickness,
          legacy: await drawLegacySlab(legacy, blendMode, slabThickness),
          adapter: await drawLegacySlab(adapter, blendMode, slabThickness),
          next: await drawNextSlab(
            next,
            displaySetId,
            blendMode,
            slabThickness
          ),
        });
      }
    }

    console.log(`[PLANAR_SLAB_MEASURE]${JSON.stringify(rows)}`);
    expect(rows.length).toBe(thicknesses.length * 2);
  }, 240000);

  it('reaches as far on the adapter and on a direct next viewport as on the legacy viewport for the same number', async function () {
    for (const slabThickness of [6, 8]) {
      const blendMode = BlendModes.MAXIMUM_INTENSITY_BLEND;
      const shows = [
        await drawLegacySlab(legacy, blendMode, slabThickness),
        await drawLegacySlab(adapter, blendMode, slabThickness),
        await drawNextSlab(next, displaySetId, blendMode, slabThickness),
      ].map((value) => value > 64);

      expect(shows).toEqual(shows.map(() => slabThickness > PLANE_DISTANCE));
    }

    for (const slabThickness of [10, 20]) {
      const blendMode = BlendModes.AVERAGE_INTENSITY_BLEND;
      const legacyValue = await drawLegacySlab(
        legacy,
        blendMode,
        slabThickness
      );
      const adapterValue = await drawLegacySlab(
        adapter,
        blendMode,
        slabThickness
      );
      const nextValue = await drawNextSlab(
        next,
        displaySetId,
        blendMode,
        slabThickness
      );

      expect(Math.abs(adapterValue - legacyValue)).toBeLessThanOrEqual(2);
      expect(Math.abs(nextValue - legacyValue)).toBeLessThanOrEqual(2);
      expect(adapter.getSlabThickness()).toBe(slabThickness);
      expect(adapter.getProperties().slabThickness).toBe(slabThickness);
    }
  }, 60000);

  it('measures a composite slab of 20 against the legacy viewport', async function () {
    const legacyValue = await drawLegacySlab(legacy, BlendModes.COMPOSITE, 20);
    const nextValue = await drawNextSlab(
      next,
      displaySetId,
      BlendModes.COMPOSITE,
      20
    );
    const averageValue = await drawLegacySlab(
      legacy,
      BlendModes.AVERAGE_INTENSITY_BLEND,
      20
    );
    const legacyAverage = readPixels(legacy);

    await drawLegacySlab(legacy, BlendModes.COMPOSITE, 20);

    const largest = getLargestDifference(readPixels(legacy), readPixels(next));

    console.log(
      `[PLANAR_SLAB_COMPOSITE]${JSON.stringify({
        legacyComposite: legacyValue,
        nextComposite: nextValue,
        legacyAverage: averageValue,
        largestDifference: largest,
        largestDifferenceToLegacyAverage: getLargestDifference(
          legacyAverage,
          readPixels(next)
        ),
      })}`
    );
    expect(largest).toBeGreaterThanOrEqual(0);
  }, 60000);
});
