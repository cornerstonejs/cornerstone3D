import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, volumeLoader } = cornerstone3D;
const { ViewportType } = Enums;
const { getViewSlabDepthOfViewport } = csTools3d.utilities;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'slabDepthNext';

/** Makes a direct next planar viewport of 400 by 400 pixels, axial. */
function createNextViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    viewportType: ViewportType.PLANAR_NEXT,
    viewportId,
  });

  return renderingEngine.getViewport(viewportId);
}

describe('The slab depth of a direct next planar viewport, as a brush reads it -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('is the slab thickness of the presentation of the source in volume mode, and undefined without a slab', async function () {
    const viewport = createNextViewport(renderingEngine);
    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
    await testUtils.setVolumesOnNextViewport(viewport, [volumeId]);

    expect(viewport.getCurrentMode()).toBe('volume');
    expect(getViewSlabDepthOfViewport(viewport)).toBeUndefined();

    viewport.setDisplaySetPresentation({ slabThickness: 5 });

    expect(getViewSlabDepthOfViewport(viewport)).toBe(5);

    viewport.setDisplaySetPresentation({ slabThickness: undefined });

    expect(getViewSlabDepthOfViewport(viewport)).toBeUndefined();
  });

  it('is undefined in stack mode', async function () {
    const viewport = createNextViewport(renderingEngine);
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
    expect(getViewSlabDepthOfViewport(viewport)).toBeUndefined();
  });
});
