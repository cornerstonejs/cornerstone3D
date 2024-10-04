import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  encodeImageIdInfo,
  createViewports,
  setupTestEnvironment,
  cleanupTestEnvironment,
} from '../../../utils/test/testUtils';

const {
  cache,
  RenderingEngine,
  Enums,
  utilities,
  imageLoader,
  metaData,
  eventTarget,
  volumeLoader,
  setUseCPURendering,
  resetUseCPURendering,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  EllipticalROITool,
  ToolGroupManager,
  Enums: csToolsEnums,
  cancelActiveManipulations,
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

const volumeId = encodeImageIdInfo(imageInfo1);

describe('EllipticalROITool (CPU):', () => {
  let renderingEngine;
  let stackToolGroup;
  let element;

  beforeAll(() => {
    setUseCPURendering(true);
  });

  afterAll(() => {
    resetUseCPURendering();
  });

  beforeEach(() => {
    const tools = [EllipticalROITool];
    const toolConfigurations = {
      [EllipticalROITool.toolName]: { volumeId: volumeId },
    };
    const toolActivations = {
      [EllipticalROITool.toolName]: { bindings: [{ mouseButton: 1 }] },
    };

    const setup = setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['stack'],
      tools,
      toolConfigurations,
      toolActivations,
      viewportIds: [viewportId],
    });

    renderingEngine = setup.renderingEngine;
    stackToolGroup = setup.toolGroups['stack'];
  });

  afterEach(() => {
    cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['stack'],
    });

    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });

  it('Should successfully create a ellipse tool on a cpu stack viewport with mouse drag - 512 x 128', (done) => {
    const element = createViewports(
      renderingEngine,
      { viewportType: ViewportType.STACK, width: 512, height: 128, viewportId },
      1
    );

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const ellipseAnnotations = annotation.state.getAnnotations(
          EllipticalROITool.toolName,
          element
        );
        expect(ellipseAnnotations).toBeDefined();
        expect(ellipseAnnotations.length).toBe(1);

        const ellipseAnnotation = ellipseAnnotations[0];
        expect(ellipseAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(ellipseAnnotation.metadata.toolName).toBe(
          EllipticalROITool.toolName
        );
        expect(ellipseAnnotation.invalidated).toBe(false);

        const data = ellipseAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);
        expect(data[targets[0]].mean).toBe(255);

        annotation.state.removeAnnotation(ellipseAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [12, 30, 0];
      const index2 = [14, 40, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);

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
      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt);
    });

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should cancel drawing of a EllipseTool annotation on a cpu stack viewport', (done) => {
    const element = createViewports(
      renderingEngine,
      { viewportType: ViewportType.STACK, width: 512, height: 128, viewportId },
      1
    );

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [12, 30, 0];
      const index2 = [14, 40, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);

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

      let e = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Esc',
        char: 'Esc',
      });
      element.dispatchEvent(e);

      e = new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(e);
    });

    const cancelToolDrawing = () => {
      const canceledDataUID = cancelActiveManipulations(element);
      expect(canceledDataUID).toBeDefined();

      setTimeout(() => {
        const ellipseAnnotations = annotation.state.getAnnotations(
          EllipticalROITool.toolName,
          element
        );
        expect(ellipseAnnotations).toBeDefined();
        expect(ellipseAnnotations.length).toBe(1);

        const ellipseAnnotation = ellipseAnnotations[0];
        expect(ellipseAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(ellipseAnnotation.metadata.toolName).toBe(
          EllipticalROITool.toolName
        );
        expect(ellipseAnnotation.invalidated).toBe(false);
        expect(ellipseAnnotation.highlighted).toBe(false);

        const data = ellipseAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);
        expect(data[targets[0]].mean).toBe(255);

        annotation.state.removeAnnotation(ellipseAnnotation.annotationUID);
        done();
      }, 100);
    };

    element.addEventListener(csToolsEvents.KEY_DOWN, cancelToolDrawing);

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });
});
