import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

import * as volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG.png';
import * as volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR from './groundTruth/volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR.png';
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
  utilities: csToolsUtils,
  SphereScissorsTool,
} = csTools3d;

const { Events } = csToolsEnums;

const { addSegmentationRepresentations, addSegmentations } = segmentation;

const {
  fakeVolumeLoader,
  fakeMetaDataProvider,
  createNormalizedMouseEvent,
  compareImages,
} = testUtils;

const renderingEngineId = 'renderingEngineId-segmentationSphereScissor_test';
const toolGroupId = 'toolGroupId-segmentationSphereScissor_test';

const viewportId1 = 'AXIAL';
const viewportId2 = 'SAGITTAL';
const viewportId3 = 'CORONAL';

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

  describe('Sphere Scissor', function () {
    beforeEach(function () {
      csTools3d.init();
      csTools3d.addTool(SphereScissorsTool);
      cache.purgeCache();
      this.DOMElements = [];

      this.segToolGroup = ToolGroupManager.createToolGroup(toolGroupId);
      this.segToolGroup.addTool(SphereScissorsTool.toolName);
      this.segToolGroup.setToolActive(SphereScissorsTool.toolName, {
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

    it('should be able to edit the segmentation data with the sphere scissor', function (done) {
      const element = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.AXIAL
      );
      const element2 = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.SAGITTAL,
        viewportId2
      );
      const element3 = createViewport(
        this.renderingEngine,
        Enums.OrientationAxis.CORONAL,
        viewportId3
      );
      this.DOMElements.push(element);
      this.DOMElements.push(element2);
      this.DOMElements.push(element3);

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0';
      const vp1 = this.renderingEngine.getViewport(viewportId1);
      const vp2 = this.renderingEngine.getViewport(viewportId2);
      const vp3 = this.renderingEngine.getViewport(viewportId3);

      const drawSphere = () => {
        eventTarget.addEventListener(
          Events.SEGMENTATION_RENDERED,
          compareImageCallback
        );

        const index1 = [50, 50, 0];
        const index2 = [60, 60, 0];

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

      let renderCount = 0;
      const newSegRenderedCallback = () => {
        renderCount++;

        if (renderCount === 3) {
          return;
        }

        eventTarget.removeEventListener(
          Events.SEGMENTATION_RENDERED,
          newSegRenderedCallback
        );

        // Since we need some time after the first render so that the
        // request animation frame is done and is ready for the next frame.
        setTimeout(() => {
          drawSphere();
        }, 500);
      };

      let compareCount = 0;
      const compareImageCallback = async () => {
        compareCount++;

        if (compareCount !== 3) {
          return;
        }

        const canvas1 = vp1.getCanvas();
        const canvas2 = vp2.getCanvas();
        const canvas3 = vp3.getCanvas();
        const image1 = canvas1.toDataURL('image/png');
        const image2 = canvas2.toDataURL('image/png');
        const image3 = canvas3.toDataURL('image/png');

        try {
          await compareImages(
            image1,
            volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX,
            'volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_AX'
          );

          await compareImages(
            image2,
            volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG,
            'volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_SAG'
          );

          await compareImages(
            image3,
            volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR,
            'volumeURI_100_100_10_1_1_1_0_SEG_SphereScissor_COR'
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
      this.segToolGroup.addViewport(vp3.id, this.renderingEngine.id);

      try {
        createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: volumeId }],
            [viewportId1, viewportId2, viewportId3]
          ).then(() => {
            vp1.render();
            vp2.render();
            vp3.render();

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
                addSegmentationRepresentations(viewportId3, [
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
