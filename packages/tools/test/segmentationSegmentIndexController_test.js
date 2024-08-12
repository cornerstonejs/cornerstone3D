import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_SEG_controller_1 from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_controller_1.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_indexController from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_indexController.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_indexLocked from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_indexLocked.png';

const {
  cache,
  RenderingEngine,
  Enums,
  metaData,
  imageLoader,
  volumeLoader,
  setVolumesForViewports,
  eventTarget,
  getEnabledElement,
} = cornerstone3D;

const { unregisterAllImageLoaders } = imageLoader;
const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;
const { ViewportType } = Enums;

const {
  ToolGroupManager,

  segmentation,
  Enums: csToolsEnums,
  utilities: csToolsUtils,
  RectangleScissorsTool,
} = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations, addSegmentations } = segmentation;

const {
  fakeVolumeLoader,
  fakeMetaDataProvider,
  createNormalizedMouseEvent,
  compareImages,
} = testUtils;

const renderingEngineId =
  'renderingEngineId-segmentationSegmentIndexController_test';
const toolGroupId = 'toolGroupId-segmentationSegmentIndexController_test';

const viewportId1 = 'AXIAL';

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

describe('Segmentation Index Controller --', () => {
  beforeAll(() => {
    window.devicePixelRatio = 1;
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Index/Lock Controller', function () {
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
      this.renderingEngine?.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      unregisterAllImageLoaders();
      ToolGroupManager.destroyToolGroup(toolGroupId);

      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('should be able to segment different indices using rectangle scissor', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp1 = this.renderingEngine.getViewport(viewportId1);

      const drawRectangle = (index1, index2) => {
        const { imageData } = vp1.getImageData();

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp1);

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
          worldCoord: worldCoord2,
        } = createNormalizedMouseEvent(imageData, index2, element, vp1);

        // Mouse Down
        let evt = new MouseEvent('mousedown', {
          target: element,
          buttons: 1,
          clientX: clientX1,
          clientY: clientY1,
          pageX: pageX1,
          pageY: pageY1,
        });
        element.dispatchEvent(evt);

        // Mouse move to put the end somewhere else
        evt = new MouseEvent('mousemove', {
          target: element,
          buttons: 1,
          clientX: clientX2,
          clientY: clientY2,
          pageX: pageX2,
          pageY: pageY2,
        });
        document.dispatchEvent(evt);

        // Mouse Up instantly after
        evt = new MouseEvent('mouseup');

        document.dispatchEvent(evt);
      };

      const newSegRenderedCallback = () => {
        eventTarget.removeEventListener(
          Events.SEGMENTATION_RENDERED,
          newSegRenderedCallback
        );

        // Since we need some time after the first render so that the
        // request animation frame is done and is ready for the next frame.
        setTimeout(() => {
          drawRectangle([20, 20, 0], [40, 40, 0]);

          eventTarget.addEventListener(
            Events.SEGMENTATION_RENDERED,
            compareImageCallback
          );
          drawRectangle([30, 30, 0], [50, 50, 0]);
        }, 500);
      };

      const compareImageCallback = () => {
        const canvas1 = vp1.getCanvas();
        const image1 = canvas1.toDataURL('image/png');

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_controller_1,
          'volumeURI_100_100_10_1_1_1_0_SEG_controller_1'
        ).then(done, done.fail);
      };

      eventTarget.addEventListener(
        Events.SEGMENTATION_RENDERED,
        newSegRenderedCallback
      );

      eventTarget.addEventListener(Events.SEGMENTATION_MODIFIED, (evt) => {
        const { segmentationId } = evt.detail;
        expect(segmentationId.includes(volumeId)).toBe(true);
      });

      this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id);

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: volumeId }],
            [viewportId1]
          ).then(() => {
            vp1.render();

            csToolsUtils.segmentation
              .createLabelmapVolumeForViewport({
                viewportId: vp1.id,
                renderingEngineId: this.renderingEngine.id,
              })
              .then((segmentationId) => {
                addSegmentations([
                  {
                    segmentationId: segmentationId,
                    representation: {
                      type: csToolsEnums.SegmentationRepresentations.Labelmap,
                      data: {
                        volumeId: segmentationId,
                      },
                    },
                  },
                ]);

                addSegmentationRepresentations(viewportId1, [
                  {
                    segmentationId: segmentationId,
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

    it('should be able to change the segment index when drawing segmentations', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp1 = this.renderingEngine.getViewport(viewportId1);

      const drawRectangle = (index1, index2) => {
        const { imageData } = vp1.getImageData();

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp1);

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
          worldCoord: worldCoord2,
        } = createNormalizedMouseEvent(imageData, index2, element, vp1);

        // Mouse Down
        let evt = new MouseEvent('mousedown', {
          target: element,
          buttons: 1,
          clientX: clientX1,
          clientY: clientY1,
          pageX: pageX1,
          pageY: pageY1,
        });
        element.dispatchEvent(evt);

        // Mouse move to put the end somewhere else
        evt = new MouseEvent('mousemove', {
          target: element,
          buttons: 1,
          clientX: clientX2,
          clientY: clientY2,
          pageX: pageX2,
          pageY: pageY2,
        });
        document.dispatchEvent(evt);

        // Mouse Up instantly after
        evt = new MouseEvent('mouseup');

        document.dispatchEvent(evt);
      };

      const newSegRenderedCallback = () => {
        eventTarget.removeEventListener(
          Events.SEGMENTATION_RENDERED,
          newSegRenderedCallback
        );

        // Since we need some time after the first render so that the
        // request animation frame is done and is ready for the next frame.
        setTimeout(() => {
          drawRectangle([20, 20, 0], [40, 40, 0]);

          const segmentationRepresentation =
            segmentation.activeSegmentation.getActiveSegmentationRepresentation(
              viewportId1
            );

          segmentation.segmentIndex.setActiveSegmentIndex(
            segmentationRepresentation.segmentationId,
            2
          );

          eventTarget.addEventListener(
            Events.SEGMENTATION_RENDERED,
            compareImageCallback
          );
          drawRectangle([30, 30, 0], [50, 50, 0]);
        }, 500);
      };

      const compareImageCallback = () => {
        const canvas1 = vp1.getCanvas();
        const image1 = canvas1.toDataURL('image/png');

        // active segmentation
        const segmentationRepresentation =
          segmentation.activeSegmentation.getActiveSegmentationRepresentation(
            viewportId1
          );

        expect(
          segmentationRepresentation.segmentationRepresentationUID
        ).toBeDefined();
        expect(segmentationRepresentation.segmentationId).toBeDefined();

        const anotherWayActiveSegmentIndex =
          segmentation.segmentIndex.getActiveSegmentIndex(
            segmentationRepresentation.segmentationId
          );

        expect(anotherWayActiveSegmentIndex).toBe(2);

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_indexController,
          'volumeURI_100_100_10_1_1_1_0_SEG_indexController'
        ).then(done, done.fail);
      };

      eventTarget.addEventListener(
        Events.SEGMENTATION_RENDERED,
        newSegRenderedCallback
      );

      eventTarget.addEventListener(Events.SEGMENTATION_MODIFIED, (evt) => {
        const { segmentationId } = evt.detail;
        expect(segmentationId.includes(volumeId)).toBe(true);
      });

      this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id);

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: volumeId }],
            [viewportId1]
          ).then(() => {
            vp1.render();

            csToolsUtils.segmentation
              .createLabelmapVolumeForViewport({
                viewportId: vp1.id,
                renderingEngineId: this.renderingEngine.id,
              })
              .then((segmentationId) => {
                addSegmentations([
                  {
                    segmentationId: segmentationId,
                    representation: {
                      type: csToolsEnums.SegmentationRepresentations.Labelmap,
                      data: {
                        volumeId: segmentationId,
                      },
                    },
                  },
                ]);

                addSegmentationRepresentations(viewportId1, [
                  {
                    segmentationId: segmentationId,
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

    it('should be able to lock a segment', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp1 = this.renderingEngine.getViewport(viewportId1);

      const drawRectangle = (index1, index2) => {
        const { imageData } = vp1.getImageData();

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp1);

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
          worldCoord: worldCoord2,
        } = createNormalizedMouseEvent(imageData, index2, element, vp1);

        // Mouse Down
        let evt = new MouseEvent('mousedown', {
          target: element,
          buttons: 1,
          clientX: clientX1,
          clientY: clientY1,
          pageX: pageX1,
          pageY: pageY1,
        });
        element.dispatchEvent(evt);

        // Mouse move to put the end somewhere else
        evt = new MouseEvent('mousemove', {
          target: element,
          buttons: 1,
          clientX: clientX2,
          clientY: clientY2,
          pageX: pageX2,
          pageY: pageY2,
        });
        document.dispatchEvent(evt);

        // Mouse Up instantly after
        evt = new MouseEvent('mouseup');

        document.dispatchEvent(evt);
      };

      const newSegRenderedCallback = () => {
        eventTarget.removeEventListener(
          Events.SEGMENTATION_RENDERED,
          newSegRenderedCallback
        );

        // Since we need some time after the first render so that the
        // request animation frame is done and is ready for the next frame.
        setTimeout(() => {
          drawRectangle([20, 20, 0], [40, 40, 0]);

          const segmentationRepresentation =
            segmentation.activeSegmentation.getActiveSegmentationRepresentation(
              viewportId1
            );

          segmentation.segmentIndex.setActiveSegmentIndex(
            segmentationRepresentation.segmentationId,
            2
          );

          segmentation.segmentLocking.setSegmentIndexLocked(
            segmentationRepresentation.segmentationId,
            1,
            true
          );

          eventTarget.addEventListener(
            Events.SEGMENTATION_RENDERED,
            compareImageCallback
          );
          drawRectangle([30, 30, 0], [50, 50, 0]);
        }, 500);
      };

      const compareImageCallback = () => {
        const canvas1 = vp1.getCanvas();
        const image1 = canvas1.toDataURL('image/png');

        // active segmentation
        const segmentationRepresentation =
          segmentation.activeSegmentation.getActiveSegmentationRepresentation(
            viewportId1
          );

        expect(
          segmentationRepresentation.segmentationRepresentationUID
        ).toBeDefined();
        expect(segmentationRepresentation.segmentationId).toBeDefined();

        const anotherWayActiveSegmentIndex =
          segmentation.segmentIndex.getActiveSegmentIndex(
            segmentationRepresentation.segmentationId
          );

        expect(anotherWayActiveSegmentIndex).toBe(2);

        const locked1 = segmentation.segmentLocking.getLockedSegmentIndices(
          segmentationRepresentation.segmentationId
        );

        expect(locked1.length).toBe(1);
        expect(locked1[0]).toBe(1);

        const lockedStatus2 = segmentation.segmentLocking.isSegmentIndexLocked(
          segmentationRepresentation.segmentationId,
          2
        );
        expect(lockedStatus2).toBe(false);

        compareImages(
          image1,
          volumeURI_100_100_10_1_1_1_0_SEG_indexLocked,
          'volumeURI_100_100_10_1_1_1_0_SEG_indexLocked'
        ).then(done, done.fail);
      };

      eventTarget.addEventListener(
        Events.SEGMENTATION_RENDERED,
        newSegRenderedCallback
      );

      eventTarget.addEventListener(Events.SEGMENTATION_MODIFIED, (evt) => {
        const { segmentationId } = evt.detail;
        expect(segmentationId.includes(volumeId)).toBe(true);
      });

      this.segToolGroup.addViewport(vp1.id, this.renderingEngine.id);

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: volumeId }],
            [viewportId1]
          ).then(() => {
            vp1.render();

            csToolsUtils.segmentation
              .createLabelmapVolumeForViewport({
                viewportId: vp1.id,
                renderingEngineId: this.renderingEngine.id,
              })
              .then((segmentationId) => {
                addSegmentations([
                  {
                    segmentationId: segmentationId,
                    representation: {
                      type: csToolsEnums.SegmentationRepresentations.Labelmap,
                      data: {
                        volumeId: segmentationId,
                      },
                    },
                  },
                ]);

                addSegmentationRepresentations(viewportId1, [
                  {
                    segmentationId: segmentationId,
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
  });
});
