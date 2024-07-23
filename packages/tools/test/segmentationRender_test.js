import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_SEG_AX from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_AX.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_SAG from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SAG.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_COR from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_COR.png';
import * as volumeURI_100_100_10_1_1_1_0_2SEGs_AX from './groundTruth/volumeURI_100_100_10_1_1_1_0_2SEGs_AX.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_AX_Custom from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_AX_Custom.png';

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

const {
  ToolGroupManager,

  segmentation,
  Enums: csToolsEnums,
} = csTools3d;

const { Events } = csToolsEnums;

const { addRepresentations, addSegmentations } = segmentation;
const { SegmentationRepresentations } = csToolsEnums;

const { fakeMetaDataProvider, compareImages, fakeVolumeLoader } = testUtils;

const renderingEngineId = 'renderingEngineId-segmentationRender_test';
const toolGroupId = 'toolGroupId-segmentationRender_test';

const viewportId1 = 'AXIAL';
const viewportId2 = 'SAGITTAL';
const viewportId3 = 'CORONAL';

const LABELMAP = SegmentationRepresentations.Labelmap;

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

describe('Segmentation Render -- ', () => {
  beforeAll(() => {
    window.devicePixelRatio = 1;
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Rendering', function () {
    beforeEach(function () {
      csTools3d.init();
      cache.purgeCache();
      this.DOMElements = [];

      this.segToolGroup = ToolGroupManager.createToolGroup(toolGroupId);
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

    it('should successfully render a segmentation on a volume', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId1);

      eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_SEG_AX,
          'volumeURI_100_100_10_1_1_1_0_SEG_AX'
        ).then(done, done.fail);
      });

      this.segToolGroup.addViewport(vp.id, this.renderingEngine.id);

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
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

            addRepresentations(viewportId1, [
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

    it('should successfully render a segmentation on a volume with more than one viewport', function (done) {
      const el1 = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL,
        viewportId1
      );
      const el2 = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.SAGITTAL,
        viewportId2
      );
      const el3 = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL,
        viewportId3
      );

      this.DOMElements.push(el1);
      this.DOMElements.push(el2);
      this.DOMElements.push(el3);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp1 = this.renderingEngine.getViewport(viewportId1);
      const vp2 = this.renderingEngine.getViewport(viewportId2);
      const vp3 = this.renderingEngine.getViewport(viewportId3);

      let renderedViewportCounts = 0;
      eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
        renderedViewportCounts++;

        if (renderedViewportCounts !== 3) {
          return;
        }

        const canvas1 = vp1.getCanvas();
        const canvas2 = vp2.getCanvas();
        const canvas3 = vp3.getCanvas();
        const image1 = canvas1.toDataURL('image/png');
        const image2 = canvas2.toDataURL('image/png');
        const image3 = canvas3.toDataURL('image/png');

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_AX,
          'volumeURI_100_100_10_1_1_1_0_AX'
        ).then(() => {
          compareImages(
            image2,
            volumeURI_100_100_10_1_1_1_0_SEG_SAG,
            'volumeURI_100_100_10_1_1_1_0_SAG'
          ).then(() => {
            compareImages(
              image3,
              volumeURI_100_100_10_1_1_1_0_SEG_COR,
              'volumeURI_100_100_10_1_1_1_0_COR'
            ).then(done, done.fail);
          });
        });
      });

      this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id);
      this.segToolGroup.addViewport(vp2.id, this.renderingEngine.id);
      this.segToolGroup.addViewport(vp3.id, this.renderingEngine.id);

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: volumeId, callback }],
            [viewportId1, viewportId2, viewportId3]
          );
          this.renderingEngine.render();
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

            addRepresentations(viewportId1, [
              {
                segmentationId: segVolumeId,
                type: csToolsEnums.SegmentationRepresentations.Labelmap,
              },
            ]);
            addRepresentations(viewportId2, [
              {
                segmentationId: segVolumeId,
                type: csToolsEnums.SegmentationRepresentations.Labelmap,
              },
            ]);
            addRepresentations(viewportId3, [
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

    it('should successfully render two segmentations on a viewport', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL,
        viewportId1
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const segVolumeId =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_20_20_3_50_50_6';
      const segVolumeId2 =
        'fakeVolumeLoader:volumeURIExact_100_100_10_1_1_1_0_60_60_2_80_80_7';
      const vp1 = this.renderingEngine.getViewport(viewportId1);

      eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
        const canvas1 = vp1.getCanvas();
        const image1 = canvas1.toDataURL('image/png');

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_2SEGs_AX,
          'volumeURI_100_100_10_1_1_1_0_2SEGs_AX'
        ).then(done, done.fail);
      });

      this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id);

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest();

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: volumeId, callback }],
            [viewportId1]
          );
          this.renderingEngine.render();
          createAndCacheVolume(segVolumeId, { imageIds: [] }).then(() => {
            createAndCacheVolume(segVolumeId2, { imageIds: [] }).then(() => {
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
                {
                  segmentationId: segVolumeId2,
                  representation: {
                    type: csToolsEnums.SegmentationRepresentations.Labelmap,
                    data: {
                      volumeId: segVolumeId2,
                    },
                  },
                },
              ]);

              addRepresentations(viewportId1, [
                {
                  segmentationId: segVolumeId,
                  type: csToolsEnums.SegmentationRepresentations.Labelmap,
                },
                {
                  segmentationId: segVolumeId2,
                  type: csToolsEnums.SegmentationRepresentations.Labelmap,
                },
              ]);
            });
          });
        });
      } catch (e) {
        done.fail(e);
      }
    });

    // it('should successfully render a segmentation with toolGroup specific config', function (done) {
    //   const element = createViewport(
    //     this.renderingEngine,
    //     Enums.OrientationAxis.AXIAL,
    //     viewportId1
    //   );
    //   this.DOMElements.push(element);

    //   const customToolGroupSegConfig = {
    //     representations: {
    //       [SegmentationRepresentations.Labelmap]: {
    //         renderOutline: false,
    //         fillAlpha: 0.99,
    //       },
    //     },
    //   };

    //   const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
    //   const segVolumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
    //   const vp1 = this.renderingEngine.getViewport(viewportId1);

    //   eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
    //     const canvas1 = vp1.getCanvas();
    //     const image1 = canvas1.toDataURL('image/png');

    //     compareImages(
    //       image1,
    //       volumeURI_100_100_10_1_1_1_0_SEG_AX_Custom,
    //       'volumeURI_100_100_10_1_1_1_0_SEG_AX_Custom'
    //     ).then(done, done.fail);
    //   });

    //   eventTarget.addEventListener(
    //     Events.SEGMENTATION_REPRESENTATION_MODIFIED,
    //     (evt) => {
    //       const toolGroupState = segmentation.state.getAllSegmentationRepresentations(
    //         this.segToolGroup.id
    //       );

    //       expect(toolGroupState).toBeDefined();

    //       const toolGroupConfig =
    //         segmentation.config.getAllSegmentsConfig(
    //           this.segToolGroup.id
    //         );

    //       expect(toolGroupConfig).toBeDefined();
    //       expect(toolGroupConfig.renderInactiveRepresentations).toBe(true);
    //       expect(toolGroupConfig.representations[LABELMAP]).toEqual(
    //         customToolGroupSegConfig.representations[LABELMAP]
    //       );
    //     }
    //   );

    //   this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id);

    //   const callback = ({ volumeActor }) =>
    //     volumeActor.getProperty().setInterpolationTypeToNearest();

    //   try {
    //     createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
    //       setVolumesForViewports(
    //         this.renderingEngine,
    //         [{ volumeId: volumeId, callback }],
    //         [viewportId1]
    //       );
    //       this.renderingEngine.render();
    //       createAndCacheVolume(segVolumeId, { imageIds: [] }).then(() => {
    //         addSegmentations([
    //           {
    //             segmentationId: segVolumeId,
    //             representation: {
    //               type: csToolsEnums.SegmentationRepresentations.Labelmap,
    //               data: {
    //                 volumeId: segVolumeId,
    //               },
    //             },
    //           },
    //         ]);

    //         addRepresentations(
    //           this.segToolGroup.id,
    //           [
    //             {
    //               segmentationId: segVolumeId,
    //               type: csToolsEnums.SegmentationRepresentations.Labelmap,
    //             },
    //           ],
    //           {
    //             ...customToolGroupSegConfig,
    //           }
    //         );
    //       });
    //     });
    //   } catch (e) {
    //     done.fail(e);
    //   }
    // });
  });
});
