import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { performMouseDownAndUp } from '../../../utils/test/testUtilsMouseEvents';
import {
  encodeImageIdInfo,
  createViewports,
} from '../../../utils/test/testUtils';

const {
  cache,
  RenderingEngine,
  Enums,
  utilities,
  imageLoader,
  eventTarget,
  metaData,
  volumeLoader,
  setVolumesForViewports,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  RectangleROITool,
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

describe('Rectangle ROI Tool:', () => {
  let testEnv;
  let renderingEngine;
  let stackToolGroup;

  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['stack'],
      tools: [RectangleROITool],
      toolActivations: {
        [RectangleROITool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
      viewportIds: [viewportId],
    });

    renderingEngine = testEnv.renderingEngine;
    stackToolGroup = testEnv.toolGroups.stack;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['stack'],
      cleanupDOMElements: true,
    });
  });

  it('Should successfully create a rectangle tool on a canvas with mouse drag - 512 x 128', function (done) {
    const element = createViewports(renderingEngine, {
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

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const rectangleAnnotations = annotation.state.getAnnotations(
          RectangleROITool.toolName,
          element
        );
        // Can successfully add rectangleROI to annotationManager
        expect(rectangleAnnotations).toBeDefined();
        expect(rectangleAnnotations.length).toBe(1);

        const rectangleAnnotation = rectangleAnnotations[0];
        expect(rectangleAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(rectangleAnnotation.metadata.toolName).toBe(
          RectangleROITool.toolName
        );
        expect(rectangleAnnotation.invalidated).toBe(false);

        const data = rectangleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // the rectangle is drawn on the strip
        expect(data[targets[0]].mean).toBe(255);

        annotation.state.removeAnnotation(rectangleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0];
      const index2 = [14, 10, 0];

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

  it('Should successfully create a rectangle tool on a canvas with mouse drag in a Volume viewport - 512 x 128', function (done) {
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.ORTHOGRAPHIC,
      width: 512,
      height: 128,
      viewportId: viewportId,
    });

    const vp = renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const rectangleAnnotations = annotation.state.getAnnotations(
          RectangleROITool.toolName,
          element
        );
        // Can successfully add rectangleROI to annotationManager
        expect(rectangleAnnotations).toBeDefined();
        expect(rectangleAnnotations.length).toBe(1);

        const rectangleAnnotation = rectangleAnnotations[0];
        expect(rectangleAnnotation.metadata.toolName).toBe(
          RectangleROITool.toolName
        );
        expect(rectangleAnnotation.invalidated).toBe(false);

        const data = rectangleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].mean).toBe(255);
        expect(data[targets[0]].stdDev).toBe(0);

        annotation.state.removeAnnotation(rectangleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      // Inside the strip which is from 50-75 in slice 2
      // volumeURI_100_100_4_1_1_1_0
      // The strip is from
      const index1 = [50, 10, 2];
      const index2 = [52, 20, 2];

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

      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt);
    });

    try {
      volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId]
        );
        vp.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a rectangle tool and modify its handle', function (done) {
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      width: 256,
      height: 256,
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

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const rectangleAnnotations = annotation.state.getAnnotations(
          RectangleROITool.toolName,
          element
        );
        // Can successfully add rectangleROI to annotationManager
        expect(rectangleAnnotations).toBeDefined();
        expect(rectangleAnnotations.length).toBe(1);

        const rectangleAnnotation = rectangleAnnotations[0];
        expect(rectangleAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(rectangleAnnotation.metadata.toolName).toBe(
          RectangleROITool.toolName
        );
        expect(rectangleAnnotation.invalidated).toBe(false);

        const data = rectangleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].mean).toBe(255);
        expect(data[targets[0]].stdDev).toBe(0);

        annotation.state.removeAnnotation(rectangleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0];
      const index2 = [14, 10, 0];
      const index3 = [11, 30, 0];

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

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, element, vp);

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

      // Select the first handle
      evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });
      element.dispatchEvent(evt);

      // Drag it somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });
      document.dispatchEvent(evt);

      // Mouse Up instantly after
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

  it('Should successfully create a rectangle tool and select but not move it', function (done) {
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      width: 512,
      height: 256,
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

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const rectangleAnnotations = annotation.state.getAnnotations(
          RectangleROITool.toolName,
          element
        );
        // Can successfully add rectangleROI to annotationManager
        expect(rectangleAnnotations).toBeDefined();
        expect(rectangleAnnotations.length).toBe(1);

        const rectangleAnnotation = rectangleAnnotations[0];
        expect(rectangleAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(rectangleAnnotation.metadata.toolName).toBe(
          RectangleROITool.toolName
        );
        expect(rectangleAnnotation.invalidated).toBe(false);

        const data = rectangleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].mean).toBe(255);
        expect(data[targets[0]].stdDev).toBe(0);

        annotation.state.removeAnnotation(rectangleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 5, 0];
      const index2 = [14, 30, 0];

      // grab the tool in its middle (just to make it easy)
      const index3 = [11, 20, 0];

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

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, element, vp);

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

      // Mouse down on the middle of the rectangleROI, just to select
      const mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });

      // Just grab and don't really move it
      const mouseUpEvt = new MouseEvent('mouseup');

      performMouseDownAndUp(
        element,
        mouseDownEvt,
        mouseUpEvt,
        addEventListenerForAnnotationRendered,
        null,
        false
      );
    });

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });
});
