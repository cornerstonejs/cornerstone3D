import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const {
  cache,
  RenderingEngine,
  Enums,
  utilities,
  setVolumesForViewports,
  getEnabledElement,
  metaData,
} = cornerstone3D;

const { Events, ViewportType, CalibrationTypes } = Enums;

const {
  LengthTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  annotation,
  utilities: toolsUtilities,
} = csTools3d;

const { calibrateImageSpacing } = toolsUtilities;

const { Events: csToolsEvents } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();

const viewportId = 'VIEWPORT';

function calculateLength(pos1, pos2) {
  const dx = pos1[0] - pos2[0];
  const dy = pos1[1] - pos2[1];
  const dz = pos1[2] - pos2[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

describe('Calibration ', () => {
  let renderingEngine;
  let toolGroup;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['stack'],
      viewportIds: [viewportId],
      tools: [LengthTool],
      toolConfigurations: {
        [LengthTool.toolName]: {
          configuration: {},
        },
      },
      toolActivations: {
        [LengthTool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
    });
    renderingEngine = testEnv.renderingEngine;
    toolGroup = testEnv.toolGroups['stack'];
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['stack'],
    });
  });

  it('Should be able to calibrate an image and update the tool', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.STACK,
      width: 256,
      height: 256,
    });

    const imageInfo1 = {
      loader: 'fakeImageLoader',
      name: 'calibratedImageURI',
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
    const scale = 1.5;
    const index1 = [32, 32, 0];
    const index2 = [10, 1, 0];

    const secondCallback = () => {
      setTimeout(() => {
        const lengthAnnotations = annotation.state.getAnnotations(
          LengthTool.toolName,
          element
        );
        expect(lengthAnnotations).toBeDefined();
        expect(lengthAnnotations.length).toBe(1);

        const lengthAnnotation = lengthAnnotations[0];
        expect(lengthAnnotation.metadata.toolName).toBe(LengthTool.toolName);
        expect(lengthAnnotation.invalidated).toBe(false);
        expect(lengthAnnotation.highlighted).toBe(true);

        const data = lengthAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].length).toBeCloseTo(
          calculateLength(index1, index2) / scale,
          0.05
        );

        annotation.state.removeAnnotation(lengthAnnotation.annotationUID);
        done();
      }, 100);
    };

    const firstCallback = () => {
      element.removeEventListener(Events.IMAGE_RENDERED, firstCallback);
      element.addEventListener(Events.IMAGE_RENDERED, secondCallback);

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      } = testUtils.createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
      } = testUtils.createNormalizedMouseEvent(imageData, index2, element, vp);

      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      element.dispatchEvent(evt);

      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      document.dispatchEvent(evt);

      evt = new MouseEvent('mouseup');
      document.dispatchEvent(evt);

      const imageId = renderingEngine
        .getViewport(viewportId)
        .getCurrentImageId();

      calibrateImageSpacing(imageId, renderingEngine, {
        type: CalibrationTypes.USER,
        scale,
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, firstCallback);

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      console.warn('Calibrate failed:', e);
      done.fail(e);
    }
  });
});
