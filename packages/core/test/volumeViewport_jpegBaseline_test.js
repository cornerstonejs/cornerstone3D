import {
  cache,
  cornerstoneStreamingImageVolumeLoader,
  Enums,
  imageLoader,
  setVolumesForViewports,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  init as dicomImageLoaderInit,
  wadouri,
} from '@cornerstonejs/dicom-image-loader';
import * as testUtils from '../../../utils/test/testUtils';

const { ViewportType, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'VIEWPORT';

// Single frame, JPEG Baseline (1.2.840.10008.1.2.4.50), YBR_FULL_422, 640x400
const imageId = 'wadouri:/testImages/TestPattern_JPEG-Baseline_YBR422.dcm';

describe('Volume Viewport JPEG Baseline YBR_FULL_422 -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;

    utilities.logger.coreLog
      .getLogger('webWorkerManager', 'webWorkerManager')
      .setLevel('error');
    wadouri.register();
    dicomImageLoaderInit();
    volumeLoader.registerVolumeLoader(
      'cornerstoneStreamingImageVolume',
      cornerstoneStreamingImageVolumeLoader
    );
  });

  afterEach(function () {
    wadouri.dataSetCacheManager.purge();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('should load and render a color JPEG Baseline image as a 3 component volume', async function () {
    // Decode the frame through the stack path first to get the expected RGB
    const image = await imageLoader.loadImage(imageId);
    expect(image.color).toBe(true);
    const expectedPixelData = new Uint8Array(image.getPixelData());
    expect(expectedPixelData.length).toBe(640 * 400 * 3);
    cache.purgeCache();

    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      orientation: Enums.OrientationAxis.AXIAL,
      viewportType: ViewportType.ORTHOGRAPHIC,
      width: 500,
      height: 500,
    });
    const vp = renderingEngine.getViewport(viewportId);

    const volumeId = 'cornerstoneStreamingImageVolume:jpegBaselineYbr422';
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds: [imageId],
    });

    expect(volume.voxelManager.numberOfComponents).toBe(3);
    expect(volume.imageData.get('numberOfComponents').numberOfComponents).toBe(
      3
    );
    expect(volume.dimensions).toEqual([640, 400, 1]);

    await new Promise((resolve) => volume.load(resolve));

    // The volume must hold the same interleaved RGB as the stack image
    const scalarData = volume.voxelManager.getCompleteScalarDataArray();
    expect(scalarData.length).toBe(expectedPixelData.length);
    expect(
      scalarData.every((value, index) => value === expectedPixelData[index])
    ).toBe(true);

    const rendered = new Promise((resolve) =>
      element.addEventListener(Events.IMAGE_RENDERED, resolve, { once: true })
    );
    await setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId]);
    vp.render();
    await rendered;

    const imageData = vp.getImageData();
    expect(imageData.dimensions).toEqual([640, 400, 1]);
    expect(imageData.voxelManager.numberOfComponents).toBe(3);
  }, 30000);
});
