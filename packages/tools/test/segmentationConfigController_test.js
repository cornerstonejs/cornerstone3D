import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_SEG_initialConfig from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_initialConfig.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize.png';

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

const { registerVolumeLoader, createAndCacheEmptyVolume } = volumeLoader;
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

const viewportId1 = 'AXIAL';

const renderingEngineId = 'renderingEngine-segmentationConfigController_test';
const toolGroupId = 'toolGroupId-segmentationConfigController_test';

function createViewport(
  renderingEngine,
  orientation,
  viewportId = viewportId1
) {
  const element = document.createElement('div');

  element.style.width = '250px';
  element.style.height = '250px';
  document.body.appendChild(element);

  renderingEngine.enableElement({
    viewportId: viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation,
      background: [1, 0, 1], // pinkish background
    },
  });
  return element;
}

// TODO: Ignored temporarily because fix/labelmap-outline changes
// are not in VTK master

describe('Segmentation Controller --', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Config Controller', function () {
    beforeEach(function () {
      csTools3d.init();
      csTools3d.addTool(RectangleScissorsTool);
      cache.purgeCache();
      this.DOMElements = [];

      this.segToolGroup = ToolGroupManager.createToolGroup(toolGroupId);
      this.segToolGroup.addTool(RectangleScissorsTool.toolName);
      this.segToolGroup.setToolActive(RectangleScissorsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });
      this.renderingEngine = new RenderingEngine(renderingEngineId);
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
    });

    afterEach(function () {
      // Note: since on toolGroup destroy, all segmentations are removed
      // from the toolGroups, and that triggers a state_updated event, we
      // need to make sure we remove the listeners before we destroy the
      // toolGroup
      eventTarget.reset();
      csTools3d.destroy();
      cache.purgeCache();
      this.renderingEngine.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      ToolGroupManager.destroyToolGroup(toolGroupId);

      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('should be able to load a segmentation with a toolGroup specific config', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

      const toolGroupSpecificConfig = {
        representations: {
          [SegmentationRepresentations.Labelmap]: {
            renderOutline: false,
            fillAlpha: 0.7,
          },
        },
      };

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const seg1VolumeID =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_20_20_3_60_60_6';
      const vp1 = this.renderingEngine.getViewport(viewportId1);

      const compareImageCallback = () => {
        const canvas1 = vp1.getCanvas();
        const image1 = canvas1.toDataURL('image/png');

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_initialConfig,
          'volumeURI_100_100_10_1_1_1_0_SEG_initialConfig'
        );

        const toolGroupSegRepresentationsConfig =
          segmentation.config.getToolGroupSpecificConfig(toolGroupId);

        const toolGroupLabelmapConfig =
          toolGroupSegRepresentationsConfig.representations[
            SegmentationRepresentations.Labelmap
          ];
        expect(toolGroupLabelmapConfig.fillAlpha).toEqual(
          toolGroupSpecificConfig.representations.LABELMAP.fillAlpha
        );
        expect(toolGroupLabelmapConfig.renderOutline).toEqual(
          toolGroupSpecificConfig.representations.LABELMAP.renderOutline
        );

        done();
      };

      eventTarget.addEventListener(
        Events.SEGMENTATION_RENDERED,
        compareImageCallback
      );

      this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id);

      try {
        createAndCacheEmptyVolume(seg1VolumeID, { imageIds: [] }).then(() => {
          createAndCacheEmptyVolume(volumeId, { imageIds: [] }).then(() => {
            setVolumesForViewports(
              this.renderingEngine,
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
                toolGroupId,
                [
                  {
                    segmentationId: seg1VolumeID,
                    type: csToolsEnums.SegmentationRepresentations.Labelmap,
                  },
                ],
                toolGroupSpecificConfig
              );
            });
          });
        });
      } catch (e) {
        done.fail(e);
      }
    });

    // Todo: we don't have a way to have initially set the colorLUTIndex anymore
    // it('should be able to set a global representation configuration', function (done) {
    //   const element = createViewport(this.renderingEngine, AXIAL)
    //   this.DOMElements.push(element)

    //   const globalRepresentationConfig = {
    //     renderOutline: false,
    //     fillAlpha: 0.996,
    //   }

    //   const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
    //   const seg1VolumeID =
    //     'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_30_30_3_80_80_6'
    //   const vp1 = this.renderingEngine.getViewport(viewportId1)

    //   const compareImageCallback = () => {
    //     const canvas1 = vp1.getCanvas()
    //     const image1 = canvas1.toDataURL('image/png')

    //     compareImages(
    //       image1,
    //       volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig,
    //       'volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig'
    //     ).then(done, done.fail)
    //   }

    //   eventTarget.addEventListener(
    //     Events.SEGMENTATION_RENDERED,
    //     compareImageCallback
    //   )

    //   this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id)

    //   try {
    //     createAndCacheEmptyVolume(seg1VolumeID, { imageIds: [] }).then(() => {
    //       createAndCacheEmptyVolume(volumeId, { imageIds: [] }).then(() => {
    //         setVolumesForViewports(
    //           this.renderingEngine,
    //           [{ volumeId: volumeId }],
    //           [viewportId1]
    //         ).then(() => {
    //           vp1.render()

    //           segmentation.segmentationConfig.setGlobalRepresentationConfig(
    //             SegmentationRepresentations.Labelmap,
    //             globalRepresentationConfig
    //           )
    //           const colorLUTIndex = 1
    //           segmentation.segmentationColor.addColorLUT(
    //             [
    //               [0, 0, 0, 0],
    //               [0, 0, 255, 255],
    //             ],
    //             colorLUTIndex
    //           )

    //           addSegmentations([
    //             {
    //               segmentationId: seg1VolumeID,
    //               representation: {
    //                 type: csToolsEnums.SegmentationRepresentations.Labelmap,
    //                 data: {
    //                   volumeId: seg1VolumeID,
    //                 },
    //               },
    //             },
    //           ])

    //           addSegmentationRepresentations(this.segToolGroup.id, [
    //             {
    //               segmentationId: seg1VolumeID,
    //               type: csToolsEnums.SegmentationRepresentations.Labelmap,
    //             },
    //           ])

    //           segmentation.segmentationColor
    //         })
    //       })
    //     })
    //   } catch (e) {
    //     done.fail(e)
    //   }
    // })

    // it('should prioritize the toolGroup specific config over global config ', function (done) {
    //   const element = createViewport(this.renderingEngine, AXIAL)
    //   this.DOMElements.push(element)

    //   const globalRepresentationConfig = {
    //     renderOutline: false,
    //     fillAlpha: 0.996,
    //   }

    //   const toolGroupSpecificConfig = {
    //     representations: {
    //       [SegmentationRepresentations.Labelmap]: {
    //         renderOutline: true,
    //         fillAlpha: 0.5,
    //       },
    //     },
    //   }

    //   const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
    //   const seg1VolumeID =
    //     'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_70_30_3_80_80_6'
    //   const vp1 = this.renderingEngine.getViewport(viewportId1)

    //   const compareImageCallback = () => {
    //     const canvas1 = vp1.getCanvas()
    //     const image1 = canvas1.toDataURL('image/png')

    //     compareImages(
    //       image1,
    //       volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize,
    //       'volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize'
    //     ).then(done, done.fail)
    //   }

    //   eventTarget.addEventListener(
    //     Events.SEGMENTATION_RENDERED,
    //     compareImageCallback
    //   )

    //   this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id)

    //   try {
    //     createAndCacheEmptyVolume(seg1VolumeID, { imageIds: [] }).then(() => {
    //       createAndCacheEmptyVolume(volumeId, { imageIds: [] }).then(() => {
    //         setVolumesForViewports(
    //           this.renderingEngine,
    //           [{ volumeId: volumeId }],
    //           [viewportId1]
    //         ).then(() => {
    //           vp1.render()

    //           segmentation.segmentationConfig.setGlobalRepresentationConfig(
    //             SegmentationRepresentations.Labelmap,
    //             globalRepresentationConfig
    //           )
    //           const colorLUTIndex = 1
    //           segmentation.segmentationColor.addColorLUT(
    //             [
    //               [0, 0, 0, 0],
    //               [0, 255, 255, 255],
    //             ],
    //             colorLUTIndex
    //           )

    //           // add two volumes on the segmentation
    //           addSegmentationRepresentations(
    //             toolGroupId,
    //             [
    //               {
    //                 volumeId: seg1VolumeID,
    //                 colorLUTIndex: 1,
    //               },
    //             ],
    //             toolGroupSpecificConfig
    //           )
    //         })
    //       })
    //     })
    //   } catch (e) {
    //     done.fail(e)
    //   }
    // })
  });
});
