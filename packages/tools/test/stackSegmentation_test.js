import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import * as imageURI_64_64_10_5_1_1_0_SEG_Mocked from './groundTruth/imageURI_64_64_10_5_1_1_0_SEG_Mocked.png';
import * as imageURI_64_64_10_5_1_1_0_SEG_Double_Mocked from './groundTruth/imageURI_64_64_10_5_1_1_0_SEG_Double_Mocked.png';
import * as imageURI_64_64_10_5_1_1_0_SEG_Mocked_Brushed from './groundTruth/imageURI_64_64_10_5_1_1_0_SEG_Mocked_Brushed.png';

const { cache, RenderingEngine, Enums, metaData, imageLoader, eventTarget } =
  cornerstone3D;

window.cornerstone = cornerstone3D;

const { unregisterAllImageLoaders } = imageLoader;
const { ViewportType } = Enums;

const {
  ToolGroupManager,
  SegmentationDisplayTool,
  segmentation,
  Enums: csToolsEnums,
  ZoomTool,
  BrushTool,
} = csTools3d;

window.cornerstoneTools = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations } = segmentation;

const { fakeMetaDataProvider, compareImages } = testUtils;

const renderingEngineId = 'renderingEngineId-stackSegmentation_test';
const toolGroupId = 'toolGroupId-stackSegmentation_test';
const segmentationId = 'segmentationId-stackSegmentation_test';

const viewportId1 = 'STACK_VIEWPORT';

function createViewport(renderingEngine, viewportId = viewportId1) {
  const element = document.createElement('div');

  element.style.width = '250px';
  element.style.height = '250px';
  document.body.appendChild(element);

  renderingEngine.enableElement({
    viewportId: viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: [1, 0, 1], // pinkish background
    },
  });
  return element;
}

describe('Stack Segmentation Rendering -- ', () => {
  beforeAll(() => {
    window.devicePixelRatio = 1;
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Rendering', function () {
    beforeEach(function () {
      csTools3d.init();
      csTools3d.addTool(SegmentationDisplayTool);
      csTools3d.addTool(ZoomTool);
      csTools3d.addTool(BrushTool);
      cache.purgeCache();
      this.DOMElements = [];

      this.segToolGroup = ToolGroupManager.createToolGroup(toolGroupId);
      this.segToolGroup.addTool(SegmentationDisplayTool.toolName);
      this.segToolGroup.addTool(ZoomTool.toolName);
      this.segToolGroup.addToolInstance('CircularBrush', BrushTool.toolName, {
        activeStrategy: 'FILL_INSIDE_CIRCLE',
      });
      this.segToolGroup.setToolEnabled(SegmentationDisplayTool.toolName);
      this.segToolGroup.setToolActive('CircularBrush', {
        bindings: [{ mouseButton: 1 }],
      });
      this.renderingEngine = new RenderingEngine(renderingEngineId);
      imageLoader.registerImageLoader(
        'fakeImageLoader',
        testUtils.fakeImageLoader
      );
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

    it('should successfully render a segmentation on a stack viewport', function (done) {
      const element = createViewport(this.renderingEngine);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId1);

      eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
        // Not sure why segmentation render is not the actual render of the
        // segmentation I spent a lot of time but still can't figure out why
        setTimeout(() => {
          const canvas = vp.getCanvas();
          const image = canvas.toDataURL('image/png');

          expect(evt.detail.toolGroupId).toBe(toolGroupId);
          compareImages(
            image,
            imageURI_64_64_10_5_1_1_0_SEG_Mocked,
            'imageURI_64_64_10_5_1_1_0_SEG_Mocked'
          ).then(done, done.fail);
        }, 100);
      });

      this.segToolGroup.addViewport(vp.id, this.renderingEngine.id);

      try {
        vp.setStack([imageId1], 0).then(() => {
          imageLoader
            .createAndCacheDerivedSegmentationImage(imageId1)
            .then(({ imageId: newSegImageId }) => {
              segmentation.addSegmentations([
                {
                  segmentationId,
                  representation: {
                    type: csToolsEnums.SegmentationRepresentations.Labelmap,
                    data: {
                      imageIdReferenceMap: new Map([[imageId1, newSegImageId]]),
                    },
                  },
                },
              ]);

              testUtils.fillStackSegmentationWithMockData({
                imageIds: [imageId1],
                segmentationImageIds: [newSegImageId],
                cornerstone: cornerstone3D,
              });

              addSegmentationRepresentations(this.segToolGroup.id, [
                {
                  segmentationId,
                  type: csToolsEnums.SegmentationRepresentations.Labelmap,
                },
              ]);

              this.renderingEngine.render();
            });
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully render two segmentations on a stack viewport', function (done) {
      const element = createViewport(this.renderingEngine);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId1);

      eventTarget.addEventListener(Events.SEGMENTATION_RENDERED, (evt) => {
        // Not sure why segmentation render is not the actual render of the
        // segmentation I spent a lot of time but still can't figure out why
        setTimeout(() => {
          const canvas = vp.getCanvas();
          const image = canvas.toDataURL('image/png');

          expect(evt.detail.toolGroupId).toBe(toolGroupId);
          compareImages(
            image,
            imageURI_64_64_10_5_1_1_0_SEG_Double_Mocked,
            'imageURI_64_64_10_5_1_1_0_SEG_Double_Mocked'
          ).then(done, done.fail);
        }, 100);
      });

      this.segToolGroup.addViewport(vp.id, this.renderingEngine.id);

      try {
        vp.setStack([imageId1], 0).then(() => {
          imageLoader
            .createAndCacheDerivedSegmentationImage(imageId1)
            .then(({ imageId: newSegImageId }) => {
              imageLoader
                .createAndCacheDerivedSegmentationImage(imageId1)
                .then(({ imageId: newSegImageId2 }) => {
                  segmentation.addSegmentations([
                    {
                      segmentationId,
                      representation: {
                        type: csToolsEnums.SegmentationRepresentations.Labelmap,
                        data: {
                          imageIdReferenceMap: new Map([
                            [imageId1, newSegImageId],
                          ]),
                        },
                      },
                    },
                  ]);
                  segmentation.addSegmentations([
                    {
                      segmentationId: 'seg2',
                      representation: {
                        type: csToolsEnums.SegmentationRepresentations.Labelmap,
                        data: {
                          imageIdReferenceMap: new Map([
                            [imageId1, newSegImageId2],
                          ]),
                        },
                      },
                    },
                  ]);

                  testUtils.fillStackSegmentationWithMockData({
                    imageIds: [imageId1],
                    segmentationImageIds: [newSegImageId],
                    cornerstone: cornerstone3D,
                  });
                  testUtils.fillStackSegmentationWithMockData({
                    imageIds: [imageId1],
                    segmentationImageIds: [newSegImageId2],
                    centerOffset: [30, 30, 0],
                    innerValue: 4,
                    outerValue: 5,
                    cornerstone: cornerstone3D,
                  });

                  addSegmentationRepresentations(this.segToolGroup.id, [
                    {
                      segmentationId,
                      type: csToolsEnums.SegmentationRepresentations.Labelmap,
                    },
                  ]);
                  addSegmentationRepresentations(this.segToolGroup.id, [
                    {
                      segmentationId: 'seg2',
                      type: csToolsEnums.SegmentationRepresentations.Labelmap,
                    },
                  ]);

                  this.renderingEngine.render();
                });
            });
        });
      } catch (e) {
        done.fail(e);
      }
    });

    it('should successfully render a segmentation on a stack viewport and use brush to edit it', function (done) {
      const element = createViewport(this.renderingEngine);
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId1);

      const compareImageCallback = (evt) => {
        // Not sure why segmentation render is not the actual render of the
        // segmentation I spent a lot of time but still can't figure out why
        setTimeout(() => {
          const canvas = vp.getCanvas();
          const image = canvas.toDataURL('image/png');
          expect(evt.detail.toolGroupId).toBe(toolGroupId);
          compareImages(
            image,
            imageURI_64_64_10_5_1_1_0_SEG_Mocked_Brushed,
            'imageURI_64_64_10_5_1_1_0_SEG_Mocked_Brushed'
          ).then(done, done.fail);
        }, 100);
      };

      const performBrushing = () => {
        eventTarget.addEventListener(
          Events.SEGMENTATION_RENDERED,
          compareImageCallback
        );

        const index1 = [50, 50, 0];
        const index2 = [60, 60, 0];

        const { imageData } = vp.getImageData();

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = testUtils.createNormalizedMouseEvent(
          imageData,
          index1,
          element,
          vp
        );

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
          worldCoord: worldCoord2,
        } = testUtils.createNormalizedMouseEvent(
          imageData,
          index2,
          element,
          vp
        );

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
          performBrushing();
        }, 100);
      };

      eventTarget.addEventListener(
        Events.SEGMENTATION_RENDERED,
        newSegRenderedCallback
      );

      this.segToolGroup.addViewport(vp.id, this.renderingEngine.id);

      try {
        vp.setStack([imageId1], 0).then(() => {
          imageLoader
            .createAndCacheDerivedSegmentationImage(imageId1)
            .then(({ imageId: newSegImageId }) => {
              segmentation.addSegmentations([
                {
                  segmentationId,
                  representation: {
                    type: csToolsEnums.SegmentationRepresentations.Labelmap,
                    data: {
                      imageIdReferenceMap: new Map([[imageId1, newSegImageId]]),
                    },
                  },
                },
              ]);

              testUtils.fillStackSegmentationWithMockData({
                imageIds: [imageId1],
                segmentationImageIds: [newSegImageId],
                cornerstone: cornerstone3D,
              });

              addSegmentationRepresentations(this.segToolGroup.id, [
                {
                  segmentationId,
                  type: csToolsEnums.SegmentationRepresentations.Labelmap,
                },
              ]);

              segmentation.segmentIndex.setActiveSegmentIndex(
                segmentationId,
                2
              );

              this.renderingEngine.render();
            });
        });
      } catch (e) {
        done.fail(e);
      }
    });
  });
});
