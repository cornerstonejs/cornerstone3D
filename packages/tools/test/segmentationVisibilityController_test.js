import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_SEG_activeInactive from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_activeInactive.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_customColorLUT from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_customColorLUT.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_visiblity from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_visiblity.png';

const {
  cache,
  RenderingEngine,
  metaData,
  volumeLoader,
  Enums,
  utilities,
  setVolumesForViewports,
  eventTarget,
  imageLoader,
  CONSTANTS,
} = cornerstone3D;

const { unregisterAllImageLoaders } = imageLoader;
const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;
const { ViewportType } = Enums;
const { ORIENTATION } = CONSTANTS;

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  SegmentationDisplayTool,
  segmentation,
  RectangleScissorsTool,
} = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations, addSegmentations } = segmentation;

const { fakeVolumeLoader, fakeMetaDataProvider, compareImages } = testUtils;

const renderingEngineId = 'renderingEngineId-segmentationSphereScissor_test';
const toolGroupId = 'toolGroupId-segmentationSphereScissor_test';

const viewportId1 = 'AXIAL';

const AXIAL = 'AXIAL';

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
      orientation: ORIENTATION[orientation],
      background: [1, 0, 1], // pinkish background
    },
  });
  return element;
}

describe('Segmentation Controller --', () => {
  beforeAll(() => {
    window.devicePixelRatio = 1;
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Visibility/Color Controller', function () {
    beforeEach(function () {
      csTools3d.init();
      csTools3d.addTool(SegmentationDisplayTool);
      csTools3d.addTool(RectangleScissorsTool);
      cache.purgeCache();
      this.DOMElements = [];

      this.segToolGroup = ToolGroupManager.createToolGroup(toolGroupId);
      this.segToolGroup.addTool(SegmentationDisplayTool.toolName);
      this.segToolGroup.addTool(RectangleScissorsTool.toolName);
      this.segToolGroup.setToolEnabled(SegmentationDisplayTool.toolName);
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

    it('should be able to load two segmentations on the toolGroup', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL);
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const seg1VolumeID =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_20_20_3_60_60_6';
      const seg2VolumeID =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_35_20_2_80_60_7_2';
      const vp1 = this.renderingEngine.getViewport(viewportId1);

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

      this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id);

      try {
        createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
          createAndCacheVolume(seg2VolumeID, { imageIds: [] }).then(() => {
            createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
              setVolumesForViewports(
                this.renderingEngine,
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

                addSegmentationRepresentations(this.segToolGroup.id, [
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

    // Todo: we don't have the ability to initially change the colorLUT of the segmentation representation yet

    // it('should be able to load two segmentations on the toolGroup with different colorIndices', function (done) {
    //   const element = createViewport(this.renderingEngine, AXIAL)
    //   this.DOMElements.push(element)

    //   const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
    //   const seg1VolumeID =
    //     'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_20_20_3_60_60_6'
    //   const seg2VolumeID =
    //     'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_35_20_2_80_60_7_2'
    //   const vp1 = this.renderingEngine.getViewport(viewportId1)

    //   const compareImageCallback = () => {
    //     const canvas1 = vp1.getCanvas()
    //     const image1 = canvas1.toDataURL('image/png')

    //     compareImages(
    //       image1,
    //       volumeURI_100_100_10_1_1_1_0_SEG_customColorLUT,
    //       'volumeURI_100_100_10_1_1_1_0_SEG_customColorLUT'
    //     ).then(done, done.fail)
    //   }

    //   eventTarget.addEventListener(
    //     Events.SEGMENTATION_RENDERED,
    //     compareImageCallback
    //   )

    //   this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id)

    //   try {
    //     createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
    //       createAndCacheVolume(seg2VolumeID, { imageIds: [] }).then(() => {
    //         createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
    //           setVolumesForViewports(
    //             this.renderingEngine,
    //             [{ volumeId: volumeId }],
    //             [viewportId1]
    //           ).then(() => {
    //             vp1.render()

    //             const colorLUTIndex = 1
    //             segmentation.segmentationColor.addColorLUT(
    //               [[245, 209, 145, 255]],
    //               colorLUTIndex
    //             )

    //             // add two volumes on the segmentation
    //             addSegmentationRepresentations(toolGroupId, [
    //               {
    //                 volumeId: seg1VolumeID,
    //                 colorLUTIndex: 1,
    //               },
    //               {
    //                 volumeId: seg2VolumeID,
    //               },
    //             ])
    //           })
    //         })
    //       })
    //     })
    //   } catch (e) {
    //     done.fail(e)
    //   }
    // })

    // it('should be able to load two segmentations on the toolGroup and make one invisible', function (done) {
    //   const element = createViewport(this.renderingEngine, AXIAL)

    //   const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
    //   const seg1VolumeID =
    //     'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_20_20_3_60_60_6'
    //   const seg2VolumeID =
    //     'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_35_20_2_80_60_7_2'
    //   const vp1 = this.renderingEngine.getViewport(viewportId1)

    //   const compareImageCallback = () => {
    //     console.log('calling compare ************')
    //     const canvas1 = vp1.getCanvas()
    //     const image1 = canvas1.toDataURL('image/png')

    //     compareImages(
    //       image1,
    //       volumeURI_100_100_10_1_1_1_0_SEG_visiblity,
    //       'volumeURI_100_100_10_1_1_1_0_SEG_visiblity'
    //     )

    //     const segmentationState =
    //       csTools3d.segmentation.state.getSegmentationRepresentations(toolGroupId)

    //     // expect(segmentationState.length).toBe(2)
    //     // expect(segmentationState[0].visibility).toBe(true)
    //     // expect(segmentationState[1].visibility).toBe(false)
    //     // expect(segmentationState[0].active).toBe(true)
    //     // expect(segmentationState[1].active).toBe(false)

    //     // done()
    //   }

    //   eventTarget.addEventListener(
    //     Events.SEGMENTATION_RENDERED,
    //     compareImageCallback
    //   )

    //   this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id)

    //   try {
    //     createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
    //       createAndCacheVolume(seg2VolumeID, { imageIds: [] }).then(() => {
    //         createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
    //           setVolumesForViewports(
    //             this.renderingEngine,
    //             [{ volumeId: volumeId }],
    //             [viewportId1]
    //           ).then(() => {
    //             vp1.render()

    //             // add two volumes on the segmentation
    //             addSegmentationRepresentations(toolGroupId, [
    //               {
    //                 volumeId: seg1VolumeID,
    //               },
    //               {
    //                 volumeId: seg2VolumeID,
    //               },
    //             ]).then(() => {
    //               const segmentationData =
    //                 segmentation.activeSegmentation.getActiveSegmentationRepresentation(
    //                   toolGroupId
    //                 )

    //               segmentation.config.visibility.setSegmentationVisibility(
    //                 toolGroupId,
    //                 segmentationData.segmentationRepresentationUID,
    //                 false
    //               )
    //             })
    //           })
    //         })
    //       })
    //     })
    //   } catch (e) {
    //     done.fail(e)
    //   }
    // }, )
  });
});
