import * as cornerstone3D from '@cornerstonejs/core';
import * as testUtils from '../../../utils/test/testUtils';
import { resolveInPlaneAxes } from '../src/utilities/segmentation/growCut/intensityRange/adaptiveRegionIntensityRange';
import { getViewportVoiMappingForVolume } from '../src/utilities/segmentation/growCut/getViewportVoiMappingForVolume';
import { getDisplayVoiSnapshot } from '../src/utilities/segmentation/growCut/runFloodFillSegmentation';
import { createNextPlanarViewport } from './nextLabelmapScenes';

const { utilities, Enums, volumeLoader, cache } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'adaptiveRegionNext';

/**
 * Shows a volume of 64 columns, 60 rows and 20 slices of 1 mm on a direct
 * next planar viewport in an orientation, and gives the volume.
 */
async function showVolume(renderingEngine, orientation) {
  const viewport = createNextPlanarViewport(
    renderingEngine,
    viewportId,
    orientation
  );
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    rows: 60,
    columns: 64,
    slices: 20,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  await testUtils.setVolumesOnNextViewport(viewport, [volumeId]);

  return { viewport, volume: cache.getVolume(volumeId) };
}

describe('The plane of the adaptive intensity range on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  [
    [OrientationAxis.AXIAL, [0, 1]],
    [OrientationAxis.SAGITTAL, [1, 2]],
    [OrientationAxis.CORONAL, [0, 2]],
  ].forEach(([orientation, inPlaneAxes]) => {
    it(`is the two volume axes of the ${orientation} view that the viewport shows`, async function () {
      const { viewport, volume } = await showVolume(
        renderingEngine,
        orientation
      );

      expect(viewport.getCurrentMode()).toBe('volume');
      expect(resolveInPlaneAxes(volume, viewport)).toEqual(inPlaneAxes);
    });
  });
});

describe('The window level that the one click segmentation reads from a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('is the VOI range and the invert flag of the volume that the viewport shows, in volume mode', async function () {
    const { viewport, volume } = await showVolume(
      renderingEngine,
      OrientationAxis.AXIAL
    );
    const defaultRange = viewport.getDefaultVOIRange(
      viewport.getSourceDisplaySetId()
    );
    const defaultMapping = getViewportVoiMappingForVolume(
      viewport,
      volume.volumeId
    );

    expect(defaultRange).toBeDefined();
    expect(defaultMapping?.voiRange).toEqual(defaultRange);
    expect(defaultMapping?.invert).toBe(false);

    viewport.setDisplaySetPresentation({
      voiRange: { lower: 10, upper: 200 },
      invert: true,
    });

    const mapping = getViewportVoiMappingForVolume(viewport, volume.volumeId);

    expect(mapping?.voiRange).toEqual({ lower: 10, upper: 200 });
    expect(mapping?.invert).toBe(true);
    expect(getDisplayVoiSnapshot(viewport, volume.volumeId)).toEqual({
      lower: 10,
      upper: 200,
      windowWidth: 190,
      windowCenter: 105,
    });
  });

  it('is the VOI range of the image that the viewport shows, in stack mode', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);
    const imageId = testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    });

    await testUtils.setStackOnNextViewport(viewport, [imageId], 0);
    expect(viewport.getCurrentMode()).toBe('stack');
    viewport.setDisplaySetPresentation({ voiRange: { lower: 20, upper: 120 } });

    expect(getViewportVoiMappingForVolume(viewport)?.voiRange).toEqual({
      lower: 20,
      upper: 120,
    });
  });
});
