import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  encodeImageIdInfo,
  createViewports,
  setupTestEnvironment,
  cleanupTestEnvironment,
} from '../../../utils/test/testUtils';
import { viewport } from '../src/utilities';

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
  CircleROITool,
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
const volumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 100,
  columns: 100,
  slices: 4,
  xSpacing: 1,
  ySpacing: 1,
});

describe('CircleROITool (CPU):', () => {
  let renderingEngine;
  let stackToolGroup;

  beforeAll(() => {
    setUseCPURendering(true);
  });

  afterAll(() => {
    resetUseCPURendering();
  });

  beforeEach(() => {
    const tools = [CircleROITool];
    const toolConfigurations = {
      [CircleROITool.toolName]: { volumeId: volumeId },
    };
    const toolActivations = {
      [CircleROITool.toolName]: { bindings: [{ mouseButton: 1 }] },
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
  });

  it('Should successfully create a circle tool on a cpu stack viewport with mouse drag - 512 x 128', (done) => {
    const element = createViewports(
      renderingEngine,
      { viewportType: ViewportType.STACK, width: 512, height: 128, viewportId },
      1
    );

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

    const imageId1 = encodeImageIdInfo(imageInfo1);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const circleAnnotations = annotation.state.getAnnotations(
          CircleROITool.toolName,
          element
        );
        expect(circleAnnotations).toBeDefined();
        expect(circleAnnotations.length).toBe(1);

        const circleAnnotation = circleAnnotations[0];
        expect(circleAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(circleAnnotation.metadata.toolName).toBe(CircleROITool.toolName);
        expect(circleAnnotation.invalidated).toBe(false);

        const data = circleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);
        expect(data[targets[0]].mean).toBe(255);

        annotation.state.removeAnnotation(circleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [12, 30, 0];
      const index2 = [14, 32, 0];

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

    const vp = renderingEngine.getViewport(viewportId);

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should cancel drawing of a CircleTool annotation on a cpu stack viewport', (done) => {
    const element = createViewports(
      renderingEngine,
      { viewportType: ViewportType.STACK, width: 512, height: 128, viewportId },
      1
    );

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

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [12, 30, 0];
      const index2 = [14, 30, 0];

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
        const circleAnnotations = annotation.state.getAnnotations(
          CircleROITool.toolName,
          element
        );
        expect(circleAnnotations).toBeDefined();
        expect(circleAnnotations.length).toBe(1);

        const circleAnnotation = circleAnnotations[0];
        expect(circleAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(circleAnnotation.metadata.toolName).toBe(CircleROITool.toolName);
        expect(circleAnnotation.invalidated).toBe(false);
        expect(circleAnnotation.highlighted).toBe(false);

        const data = circleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        annotation.state.removeAnnotation(circleAnnotation.annotationUID);
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
