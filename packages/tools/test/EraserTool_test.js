import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { EraserTool } from '@cornerstonejs/tools';
import { triggerAnnotationAddedForElement } from '../src/stateManagement/annotation/helpers/state';

const {
  cache,
  RenderingEngine,
  Enums,
  eventTarget,
  utilities,
  imageLoader,
  metaData,
  volumeLoader,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  LengthTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  annotation,
} = csTools3d;

const { Events: csToolsEvents } = csToolsEnums;

const {
  fakeImageLoader,
  fakeVolumeLoader,
  fakeMetaDataProvider,
  createNormalizedMouseEvent,
} = testUtils;

const renderingEngineId = utilities.uuidv4();

const viewportId = 'VIEWPORT';

function createViewport(renderingEngine, viewportType, width, height) {
  const element = document.createElement('div');

  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  document.body.appendChild(element);

  renderingEngine.setViewports([
    {
      viewportId: viewportId,
      type: viewportType,
      element,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
  ]);
  return element;
}

const volumeId = `fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0`;

describe('EraserTool:', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Cornerstone Tools: -- Eraser', () => {
    beforeEach(function () {
      csTools3d.init();
      csTools3d.addTool(EraserTool);
      csTools3d.addTool(LengthTool);

      cache.purgeCache();
      this.DOMElements = [];

      this.stackToolGroup = ToolGroupManager.createToolGroup('stack');
      this.stackToolGroup.addTool(LengthTool.toolName, {});
      this.stackToolGroup.setToolEnabled(LengthTool.toolName, {});
      this.stackToolGroup.addTool(EraserTool.toolName, {});
      this.stackToolGroup.setToolActive(EraserTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });

      this.renderingEngine = new RenderingEngine(renderingEngineId);
      imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
      volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
    });

    afterEach(function () {
      csTools3d.destroy();
      eventTarget.reset();
      cache.purgeCache();

      this.renderingEngine.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      imageLoader.unregisterAllImageLoaders();
      ToolGroupManager.destroyToolGroup('stack');

      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('Should successfully delete a length annotation on a canvas with mouse down - 512 x 128', function (done) {
      const element = createViewport(
        this.renderingEngine,
        ViewportType.STACK,
        512,
        128
      );

      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      eventTarget.addEventListener(csToolsEvents.ANNOTATION_REMOVED, () => {
        const lengthAnnotations = annotation.state.getAnnotations(
          LengthTool.toolName,
          element
        );
        expect(lengthAnnotations).toBeDefined();
        expect(lengthAnnotations.length).toBe(0);
        done();
      });

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const index1 = [32, 32, 0];
        const index2 = [10, 1, 0];

        const { imageData } = vp.getImageData();

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(imageData, index1, element, vp);
        const { worldCoord: worldCoord2 } = createNormalizedMouseEvent(
          imageData,
          index2,
          element,
          vp
        );

        const camera = vp.getCamera();
        const { viewPlaneNormal, viewUp } = camera;

        const lengthAnnotation = {
          highlighted: true,
          invalidated: true,
          metadata: {
            toolName: LengthTool.toolName,
            viewPlaneNormal: [...viewPlaneNormal],
            viewUp: [...viewUp],
            FrameOfReferenceUID: vp.getFrameOfReferenceUID(),
            referencedImageId: imageId1,
          },
          data: {
            handles: {
              points: [[...worldCoord1], [...worldCoord2]],
              activeHandleIndex: null,
              textBox: {
                hasMoved: false,
                worldPosition: [0, 0, 0],
                worldBoundingBox: {
                  topLeft: [0, 0, 0],
                  topRight: [0, 0, 0],
                  bottomLeft: [0, 0, 0],
                  bottomRight: [0, 0, 0],
                },
              },
            },
            label: '',
            cachedStats: {},
          },
        };

        annotation.state.addAnnotation(lengthAnnotation, element);
        triggerAnnotationAddedForElement(lengthAnnotation, element);

        let evt = new MouseEvent('mousedown', {
          target: element,
          buttons: 1,
          clientX: clientX1,
          clientY: clientY1,
          pageX: pageX1,
          pageY: pageY1,
        });

        element.dispatchEvent(evt);
      });

      this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

      try {
        vp.setStack([imageId1], 0);
        this.renderingEngine.render();
      } catch (e) {
        done.fail(e);
      }
    });
  });
});
