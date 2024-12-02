import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { EraserTool, LengthTool } from '@cornerstonejs/tools';
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

const { ToolGroupManager, Enums: csToolsEnums, annotation } = csTools3d;

const { Events: csToolsEvents } = csToolsEnums;

const {
  fakeImageLoader,
  fakeVolumeLoader,
  fakeMetaDataProvider,
  createNormalizedMouseEvent,
} = testUtils;

const renderingEngineId = utilities.uuidv4();

const viewportId = 'VIEWPORT';

describe('EraserTool:', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Cornerstone Tools: -- Eraser', () => {
    let testEnv;
    let renderingEngine;
    let stackToolGroup;

    beforeEach(function () {
      testEnv = testUtils.setupTestEnvironment({
        renderingEngineId: renderingEngineId,
        toolGroupIds: ['stack'],
        tools: [EraserTool, LengthTool],
        toolActivations: {
          [EraserTool.toolName]: {
            bindings: [{ mouseButton: 1 }],
          },
        },
        viewportIds: [viewportId],
      });

      renderingEngine = testEnv.renderingEngine;
      stackToolGroup = testEnv.toolGroups.stack;

      stackToolGroup.addTool(LengthTool.toolName, {});
      stackToolGroup.setToolEnabled(LengthTool.toolName, {});
    });

    afterEach(function () {
      testUtils.cleanupTestEnvironment({
        renderingEngineId: renderingEngineId,
        toolGroupIds: ['stack'],
        cleanupDOMElements: true,
      });
    });

    it('Should successfully delete a length annotation on a canvas with mouse down - 512 x 128', function (done) {
      const element = testUtils.createViewports(renderingEngine, {
        viewportType: ViewportType.STACK,
        width: 512,
        height: 128,
        viewportId: viewportId,
      });

      const imageInfo1 = {
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 10,
        barWidth: 5,
        xSpacing: 1,
        ySpacing: 1,
        sliceIndex: 0,
      };

      const imageId1 = testUtils.encodeImageIdInfo(imageInfo1);
      const vp = renderingEngine.getViewport(viewportId);

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

      try {
        vp.setStack([imageId1], 0);
        renderingEngine.render();
      } catch (e) {
        done.fail(e);
      }
    });
  });
});
