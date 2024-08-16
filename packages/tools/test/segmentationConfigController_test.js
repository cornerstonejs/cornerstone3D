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

const viewportId1 = 'AXIAL';

const renderingEngineId = 'renderingEngine-segmentationConfigController_test';
const toolGroupId = 'toolGroupId-segmentationConfigController_test';

function createViewport(
  renderingEngine,
  orientation,
  viewportId = viewportId1
) {
  const element = document.createElement('div');

  element.style.width = '500px';
  element.style.height = '500px';
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

    it('should be able to load a segmentation with a config', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

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
      const vp1 = this.renderingEngine.getViewport(viewportId1);

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

      this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id);

      try {
        createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
          createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
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

    // Todo: we don't have a way to have initially set the colorLUTIndex anymore
    // it('should be able to set a global representation configuration', function (done) {
    //   const element = createViewport(this.renderingEngine, AXIAL);
    //   this.DOMElements.push(element);

    //   const globalRepresentationConfig = {
    //     renderOutline: false,
    //     fillAlpha: 0.996,
    //   };

    //   const volumeId = testUtils.encodeVolumeIdInfo({
    //     loader: 'fakeVolumeLoader',
    //     name: 'volumeURI',
    //     rows: 100,
    //     columns: 100,
    //     slices: 10,
    //     xSpacing: 1,
    //     ySpacing: 1,
    //     zSpacing: 1,
    //   });
    //   const seg1VolumeID = testUtils.encodeVolumeIdInfo({
    //     loader: 'fakeVolumeLoader',
    //     name: 'volumeURIExact',
    //     rows: 100,
    //     columns: 100,
    //     slices: 10,
    //     xSpacing: 1,
    //     ySpacing: 1,
    //     zSpacing: 1,
    //     startRow: 30,
    //     startColumn: 30,
    //     startSlice: 3,
    //     endRow: 80,
    //     endColumn: 80,
    //     endSlice: 6,
    //   });
    //   const vp1 = this.renderingEngine.getViewport(viewportId1);

    //   const compareImageCallback = () => {
    //     const canvas1 = vp1.getCanvas();
    //     const image1 = canvas1.toDataURL('image/png');

    //     compareImages(
    //       image1,
    //       volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig,
    //       'volumeURI_100_100_10_1_1_1_0_SEG_GlobalConfig'
    //     ).then(done, done.fail);
    //   };

    //   eventTarget.addEventListener(
    //     Events.SEGMENTATION_RENDERED,
    //     compareImageCallback
    //   );

    //   this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id);

    //   try {
    //     createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
    //       createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
    //         setVolumesForViewports(
    //           this.renderingEngine,
    //           [{ volumeId: volumeId }],
    //           [viewportId1]
    //         ).then(() => {
    //           vp1.render();

    //           segmentation.segmentationConfig.setGlobalRepresentationConfig(
    //             SegmentationRepresentations.Labelmap,
    //             globalRepresentationConfig
    //           );
    //           const colorLUTIndex = 1;
    //           segmentation.segmentationColor.addColorLUT(
    //             [
    //               [0, 0, 0, 0],
    //               [0, 0, 255, 255],
    //             ],
    //             colorLUTIndex
    //           );

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
    //           ]);

    //           addSegmentationRepresentations(this.segToolGroup.id, [
    //             {
    //               segmentationId: seg1VolumeID,
    //               type: csToolsEnums.SegmentationRepresentations.Labelmap,
    //             },
    //           ]);

    //           segmentation.segmentationColor;
    //         });
    //       });
    //     });
    //   } catch (e) {
    //     done.fail(e);
    //   }
    // });

    // it('should prioritize the toolGroup specific config over global config ', function (done) {
    //   const element = createViewport(this.renderingEngine, AXIAL);
    //   this.DOMElements.push(element);

    //   const globalRepresentationConfig = {
    //     renderOutline: false,
    //     fillAlpha: 0.996,
    //   };

    //   const toolGroupSpecificConfig = {
    //     representations: {
    //       [SegmentationRepresentations.Labelmap]: {
    //         renderOutline: true,
    //         fillAlpha: 0.5,
    //       },
    //     },
    //   };

    //   const volumeId = testUtils.encodeVolumeIdInfo({
    //     loader: 'fakeVolumeLoader',
    //     name: 'volumeURI',
    //     rows: 100,
    //     columns: 100,
    //     slices: 10,
    //     xSpacing: 1,
    //     ySpacing: 1,
    //     zSpacing: 1,
    //   });
    //   const seg1VolumeID = testUtils.encodeVolumeIdInfo({
    //     loader: 'fakeVolumeLoader',
    //     name: 'volumeURIExact',
    //     rows: 100,
    //     columns: 100,
    //     slices: 10,
    //     xSpacing: 1,
    //     ySpacing: 1,
    //     zSpacing: 1,
    //     startRow: 70,
    //     startColumn: 30,
    //     startSlice: 3,
    //     endRow: 80,
    //     endColumn: 80,
    //     endSlice: 6,
    //   });
    //   const vp1 = this.renderingEngine.getViewport(viewportId1);

    //   const compareImageCallback = () => {
    //     const canvas1 = vp1.getCanvas();
    //     const image1 = canvas1.toDataURL('image/png');

    //     compareImages(
    //       image1,
    //       volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize,
    //       'volumeURI_100_100_10_1_1_1_0_SEG_ToolGroupPrioritize'
    //     ).then(done, done.fail);
    //   };

    //   eventTarget.addEventListener(
    //     Events.SEGMENTATION_RENDERED,
    //     compareImageCallback
    //   );

    //   this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id);

    //   try {
    //     createAndCacheVolume(seg1VolumeID, { imageIds: [] }).then(() => {
    //       createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
    //         setVolumesForViewports(
    //           this.renderingEngine,
    //           [{ volumeId: volumeId }],
    //           [viewportId1]
    //         ).then(() => {
    //           vp1.render();

    //           segmentation.segmentationConfig.setGlobalRepresentationConfig(
    //             SegmentationRepresentations.Labelmap,
    //             globalRepresentationConfig
    //           );
    //           const colorLUTIndex = 1;
    //           segmentation.segmentationColor.addColorLUT(
    //             [
    //               [0, 0, 0, 0],
    //               [0, 255, 255, 255],
    //             ],
    //             colorLUTIndex
    //           );

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
    //           );
    //         });
    //       });
    //     });
    //   } catch (e) {
    //     done.fail(e);
    //   }
    // });
  });
});
