import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_SEG_AX from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_AX.png';

const {
  cache,
  RenderingEngine,
  Enums,
  metaData,
  imageLoader,
  volumeLoader,
  setVolumesForViewports,
  eventTarget,
} = cornerstone3D;

const { unregisterAllImageLoaders } = imageLoader;
const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;
const { ViewportType } = Enums;

const { ToolGroupManager, segmentation, Enums: csToolsEnums } = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations, addSegmentations } = segmentation;
const { SegmentationRepresentations } = csToolsEnums;

const { fakeMetaDataProvider, compareImages, fakeVolumeLoader } = testUtils;

const renderingEngineId = 'renderingEngineId-segmentationRender_test';
const toolGroupId = 'toolGroupId-segmentationRender_test';

const viewportId1 = 'AXIAL';
const viewportId2 = 'SAGITTAL';
const viewportId3 = 'CORONAL';

describe('Segmentation Render:', () => {
  let testEnv;
  let renderingEngine;
  let segToolGroup;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: [toolGroupId],
      viewportIds: [viewportId1, viewportId2, viewportId3],
    });

    renderingEngine = testEnv.renderingEngine;
    segToolGroup = testEnv.toolGroups[toolGroupId];
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: [toolGroupId],
      cleanupDOMElements: true,
    });
  });

  it('should successfully render a segmentation on a volume', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.ORTHOGRAPHIC,
      orientation: Enums.OrientationAxis.AXIAL,
      viewportId: viewportId1,
    });

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

    const segVolumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    const vp = renderingEngine.getViewport(viewportId1);

    eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
      const canvas = vp.getCanvas();
      const image = canvas.toDataURL('image/png');

      compareImages(
        image,
        volumeURI_100_100_10_1_1_1_0_SEG_AX,
        'volumeURI_100_100_10_1_1_1_0_SEG_AX'
      ).then(done, done.fail);
    });

    const callback = ({ volumeActor }) =>
      volumeActor.getProperty().setInterpolationTypeToNearest();

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId, callback }],
          [viewportId1]
        );
        vp.render();
        createAndCacheVolume(segVolumeId, { imageIds: [] }).then(() => {
          addSegmentations([
            {
              segmentationId: segVolumeId,
              representation: {
                type: csToolsEnums.SegmentationRepresentations.Labelmap,
                data: {
                  volumeId: segVolumeId,
                },
              },
            },
          ]);

          addSegmentationRepresentations(viewportId1, [
            {
              segmentationId: segVolumeId,
              type: csToolsEnums.SegmentationRepresentations.Labelmap,
            },
          ]);
        });
      });
    } catch (e) {
      done.fail(e);
    }
  });

  // Add more tests here...
});
