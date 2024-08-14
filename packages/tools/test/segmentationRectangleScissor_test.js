import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_SEG_RectangleScissor from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_RectangleScissor.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_SAG_RectangleScissor from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SAG_RectangleScissor.png';

const {
  cache,
  RenderingEngine,
  Enums,
  metaData,
  volumeLoader,
  imageLoader,
  setVolumesForViewports,
  eventTarget,
} = cornerstone3D;

const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;
const { unregisterAllImageLoaders } = imageLoader;
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

const renderingEngineId = 'renderingEngine-segmentationRectangleScissor_test';
const toolGroupId = 'toolGroupId-segmentationRectangleScissor_test';

const viewportId1 = 'AXIAL';
const viewportId2 = 'SAGITTAL';

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

describe('Segmentation Tools --', () => {
  beforeAll(() => {
    window.devicePixelRatio = 1;
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Rectangle Scissor:', function () {
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

    it('should be able to create a new segmentation from a viewport', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
        rgb: 0,
        pt: 0,
      });
      const vp = this.renderingEngine.getViewport(viewportId1);

      eventTarget.addEventListener(Events.SEGMENTATION_MODIFIED, (evt) => {
        const { segmentationId } = evt.detail;
        expect(segmentationId.includes(volumeId)).toBe(true);
      });

      // wait until the render loop is done before we say done
      eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
        done();
      });

      this.segToolGroup.addViewport(vp.id, this.renderingEngine.id);

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: volumeId }],
            [viewportId1]
          ).then(() => {
            vp.render();

            csToolsUtils.segmentation
              .createLabelmapVolumeForViewport({
                viewportId: vp.id,
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

    it('should be able to edit the segmentation data with the rectangle scissor', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      this.DOMElements.push(element);

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
        rgb: 0,
        pt: 0,
      });
      const vp = this.renderingEngine.getViewport(viewportId1);

      const drawRectangle = () => {
        eventTarget.addEventListener(
          Events.SEGMENTATION_RENDERED,
          compareImageCallback
        );

        const index1 = [11, 5, 0];
        const index2 = [80, 80, 0];

        const { imageData } = vp.getImageData();

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp);

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
          worldCoord: worldCoord2,
        } = createNormalizedMouseEvent(imageData, index2, element, vp);

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
          drawRectangle();
        }, 500);
      };

      const compareImageCallback = () => {
        const canvas = vp.getCanvas();
        const image = canvas.toDataURL('image/png');

        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_SEG_RectangleScissor,
          'volumeURI_100_100_10_1_1_1_0_SEG_RectangleScissor'
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

      this.segToolGroup.addViewport(vp.id, this.renderingEngine.id);

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: volumeId }],
            [viewportId1]
          ).then(() => {
            vp.render();

            csToolsUtils.segmentation
              .createLabelmapVolumeForViewport({
                viewportId: vp.id,
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

    it('should be able to edit the segmentation data with the rectangle scissor with two viewports to render', function (done) {
      const element1 = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      const element2 = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.SAGITTAL,
        viewportId2
      );
      this.DOMElements.push(element1);
      this.DOMElements.push(element2);

      const volumeId = testUtils.encodeVolumeIdInfo({
        loader: 'fakeVolumeLoader',
        name: 'volumeURI',
        rows: 100,
        columns: 100,
        slices: 10,
        xSpacing: 1,
        ySpacing: 1,
        zSpacing: 1,
        rgb: 0,
        pt: 0,
      });
      const vp1 = this.renderingEngine.getViewport(viewportId1);
      const vp2 = this.renderingEngine.getViewport(viewportId2);

      const drawRectangle = () => {
        eventTarget.removeEventListener(
          Events.SEGMENTATION_RENDERED,
          drawRectangle
        );
        eventTarget.addEventListener(
          Events.SEGMENTATION_RENDERED,
          compareImageCallback
        );

        const index1 = [11, 5, 0];
        const index2 = [80, 80, 0];

        const { imageData } = vp1.getImageData();

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(imageData, index1, element1, vp1);

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
          worldCoord: worldCoord2,
        } = createNormalizedMouseEvent(imageData, index2, element1, vp1);

        // Mouse Down
        let evt = new MouseEvent('mousedown', {
          target: element1,
          buttons: 1,
          clientX: clientX1,
          clientY: clientY1,
          pageX: pageX1,
          pageY: pageY1,
        });
        element1.dispatchEvent(evt);

        // Mouse move to put the end somewhere else
        evt = new MouseEvent('mousemove', {
          target: element1,
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

      let newSegRenderCount = 0;
      const newSegRenderedCallback = () => {
        newSegRenderCount++;

        if (newSegRenderCount !== 2) {
          return;
        }

        eventTarget.removeEventListener(
          Events.SEGMENTATION_RENDERED,
          newSegRenderedCallback
        );

        // Since we need some time after the first render so that the
        // request animation frame is done and is ready for the next frame.
        setTimeout(() => {
          drawRectangle();
        }, 500);
      };

      let compareCount = 0;
      const compareImageCallback = async () => {
        compareCount++;

        // since we are triggering segmentationRendered on each element,
        // until both are rendered, we should not be comparing the images
        if (compareCount !== 2) {
          return;
        }

        const canvas1 = vp1.getCanvas();
        const canvas2 = vp2.getCanvas();

        const image1 = canvas1.toDataURL('image/png');
        const image2 = canvas2.toDataURL('image/png');

        try {
          await compareImages(
            image1,
            volumeURI_100_100_10_1_1_1_0_SEG_RectangleScissor,
            'volumeURI_100_100_10_1_1_1_0_SEG_RectangleScissor'
          );

          await compareImages(
            image2,
            volumeURI_100_100_10_1_1_1_0_SEG_SAG_RectangleScissor,
            'volumeURI_100_100_10_1_1_1_0_SEG_SAG_RectangleScissor'
          );
        } catch (error) {
          return done.fail(error);
        }

        done();
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
      this.segToolGroup.addViewport(vp2.id, this.renderingEngine.id);

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: volumeId }],
            [viewportId1, viewportId2]
          ).then(() => {
            vp1.render();
            vp2.render();

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
                addSegmentationRepresentations(viewportId2, [
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
