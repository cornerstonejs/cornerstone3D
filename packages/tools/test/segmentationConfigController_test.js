import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_SEG_initialConfig from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_initialConfig.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig.png';

const {
  cache,
  RenderingEngine,
  Enums,
  imageLoader,
  metaData,
  setVolumesForViewports,
  eventTarget,
  volumeLoader,
  getEnabledElement,
} = cornerstone3D;

const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;
const { unregisterAllImageLoaders } = imageLoader;
const { ViewportType } = Enums;

const {
  ToolGroupManager,
  segmentation,
  Enums: csToolsEnums,
  RectangleScissorsTool,
} = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations, addSegmentations } = segmentation;
const { SegmentationRepresentations } = csToolsEnums;

const { fakeVolumeLoader, fakeMetaDataProvider, compareImages } = testUtils;

const viewportId1 = 'viewport1';

const toolGroupId = 'toolGroupId-segmentationConfigController_test';

describe('Segmentation Controller:', () => {
  let testEnv;
  let renderingEngine;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
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
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngine.id,
      toolGroupIds: [toolGroupId],
    });
  });

  it('should be able to load a segmentation with a config', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.ORTHOGRAPHIC,
      orientation: Enums.OrientationAxis.AXIAL,
      viewportId: viewportId1,
    });

    const initialConfig = {
      representations: {
        [SegmentationRepresentations.Labelmap]: {
          renderOutline: false,
          fillAlpha: 0.7,
        },
      },
    };

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
      id: 'seg1VolumeID',
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

    const vp1 = renderingEngine.getViewport(viewportId1);
    let representationUID;

    const compareImageCallback = () => {
      const canvas1 = vp1.getCanvas();
      const image1 = canvas1.toDataURL('image/png');

      compareImages(
        image1,
        volumeURI_100_100_10_1_1_1_0_SEG_initialConfig,
        'volumeURI_100_100_10_1_1_1_0_SEG_initialConfig'
      );

      const config =
        segmentation.config.getSegmentationRepresentationConfig(
          representationUID
        );

      if (config?.LABELMAP) {
        const labelmapConfig = config.LABELMAP;
        if (labelmapConfig) {
          expect(labelmapConfig.fillAlpha).toEqual(
            initialConfig.representations.LABELMAP.fillAlpha
          );
          expect(labelmapConfig.renderOutline).toEqual(
            initialConfig.representations.LABELMAP.renderOutline
          );
        } else {
          console.error('Labelmap configuration not found');
        }
      } else {
        console.error('Invalid configuration structure');
      }

      done();
    };

    eventTarget.addEventListener(
      Events.SEGMENTATION_RENDERED,
      compareImageCallback
    );

    try {
      createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            renderingEngine,
            [{ volumeId: volumeId }],
            [viewportId1]
          ).then(() => {
            vp1.render();

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
            ]);

            addSegmentationRepresentations(
              viewportId1,
              [
                {
                  segmentationId: seg1VolumeID,
                  type: csToolsEnums.SegmentationRepresentations.Labelmap,
                },
              ],
              initialConfig
            ).then((uids) => {
              representationUID = [uids];
            });
          });
        });
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
