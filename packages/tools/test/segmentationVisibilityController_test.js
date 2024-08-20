import * as cornerstone3D from '@cornerstonejs/core';
import * as testUtils from '../../../utils/test/testUtils';
import * as csTools3d from '../src/index';

import * as volumeURI_100_100_10_1_1_1_0_SEG_activeInactive from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_activeInactive.png';

const {
  cache,
  RenderingEngine,
  metaData,
  volumeLoader,
  Enums,
  setVolumesForViewports,
  eventTarget,
} = cornerstone3D;

const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;
const { ViewportType } = Enums;

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  RectangleScissorsTool,
} = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations, addSegmentations } = segmentation;

const { fakeVolumeLoader, fakeMetaDataProvider, compareImages } = testUtils;

const renderingEngineId =
  'renderingEngineId-segmentationVisibilityController_test';
const toolGroupId = 'toolGroupId-segmentationVisibilityController_test';

const viewportId1 = 'AXIAL';

describe('Segmentation Controller:', () => {
  let testEnv;
  let renderingEngine;
  let segToolGroup;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [RectangleScissorsTool],
      toolActivations: {
        [RectangleScissorsTool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
      viewportIds: [viewportId1],
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

  it('should be able to load two segmentations on the toolGroup', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.ORTHOGRAPHIC,
      orientation: Enums.OrientationAxis.AXIAL,
      viewportId: viewportId1,
    });

    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      id: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    const seg1VolumeID = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      id: 'volumeURIExact',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
      startRow: 20,
      startColumn: 20,
      startSlice: 3,
      endRow: 60,
      endColumn: 60,
      endSlice: 6,
    });

    const seg2VolumeID = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      id: 'seg2VolumeID',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
      startRow: 35,
      startColumn: 20,
      startSlice: 2,
      endRow: 80,
      endColumn: 60,
      endSlice: 7,
    });

    const vp1 = renderingEngine.getViewport(viewportId1);

    const compareImageCallback = () => {
      const canvas1 = vp1.getCanvas();
      const image1 = canvas1.toDataURL('image/png');

      compareImages(
        image1,
        volumeURI_100_100_10_1_1_1_0_SEG_activeInactive,
        'volumeURI_100_100_10_1_1_1_0_SEG_activeInactive'
      ).then(done, done.fail);
    };

    eventTarget.addEventListener(
      Events.SEGMENTATION_RENDERED,
      compareImageCallback
    );

    segToolGroup.addViewport(vp1.id, renderingEngine.id);

    try {
      createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
        createAndCacheVolume(seg2VolumeID, { imageIds: [] }).then(() => {
          createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
            setVolumesForViewports(
              renderingEngine,
              [{ volumeId: volumeId }],
              [viewportId1]
            ).then(() => {
              vp1.render();

              // add two volumes on the segmentation
              addSegmentations([
                {
                  segmentationId: seg1VolumeID,
                  representation: {
                    type: csToolsEnums.SegmentationRepresentations.Labelmap,
                    data: {
                      volumeId: seg1VolumeID,
                    },
                  },
                },
                {
                  segmentationId: seg2VolumeID,
                  representation: {
                    type: csToolsEnums.SegmentationRepresentations.Labelmap,
                    data: {
                      volumeId: seg2VolumeID,
                    },
                  },
                },
              ]);

              addSegmentationRepresentations(viewportId1, [
                {
                  segmentationId: seg1VolumeID,
                  type: csToolsEnums.SegmentationRepresentations.Labelmap,
                },
                {
                  segmentationId: seg2VolumeID,
                  type: csToolsEnums.SegmentationRepresentations.Labelmap,
                },
              ]);
            });
          });
        });
      });
    } catch (e) {
      done.fail(e);
    }
  });

  // Commented out test can be similarly updated if needed
});
