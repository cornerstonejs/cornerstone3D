import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const {
  cache,
  RenderingEngine,
  Enums,
  utilities,
  imageLoader,
  metaData,
  eventTarget,
  volumeLoader,
  setVolumesForViewports,
  getEnabledElement,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  CircleROITool,
  ToolGroupManager,
  cancelActiveManipulations,
  annotation,
  Enums: csToolsEnums,
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

const AXIAL = 'AXIAL';

const volumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 100,
  columns: 100,
  slices: 4,
  xSpacing: 1,
  ySpacing: 1,
  zSpacing: 1,
});

describe('Circle Tool: ', () => {
  let renderingEngine;
  let toolGroup;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['stack'],
      viewportIds: [viewportId],
      tools: [CircleROITool],
      toolConfigurations: {
        [CircleROITool.toolName]: {
          configuration: { volumeId: volumeId },
        },
      },
      toolActivations: {
        [CircleROITool.toolName]: {
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

  it('Should successfully create a circle tool on a canvas with mouse drag - 512 x 128', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.STACK,
      width: 512,
      height: 128,
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
    };

    const imageId1 = testUtils.encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

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

        // the rectangle is drawn on the strip
        expect(data[targets[0]].mean).toBe(255);

        annotation.state.removeAnnotation(circleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      // Since circle draws from center to out, we are picking a very center
      // point in the image  (strip is 255 from 10-15 in X and from 0-64 in Y)
      const index1 = [12, 30, 0];
      const index2 = [14, 30, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = testUtils.createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = testUtils.createNormalizedMouseEvent(imageData, index2, element, vp);

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

  it('Should successfully create a circle tool on a canvas with mouse drag in a Volume viewport - 512 x 128', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.ORTHOGRAPHIC,
      width: 512,
      height: 128,
    });

    const vp = renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const circleAnnotations = annotation.state.getAnnotations(
          CircleROITool.toolName,
          element
        );
        expect(circleAnnotations).toBeDefined();
        expect(circleAnnotations.length).toBe(1);

        const circleAnnotation = circleAnnotations[0];
        expect(circleAnnotation.metadata.toolName).toBe(CircleROITool.toolName);
        expect(circleAnnotation.invalidated).toBe(false);

        const data = circleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].mean).toBe(255);
        expect(data[targets[0]].stdDev).toBe(0);

        annotation.state.removeAnnotation(circleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [53, 53, 2];
      const index2 = [54, 54, 2];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = testUtils.createNormalizedMouseEvent(imageData, index1, element, vp);
      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = testUtils.createNormalizedMouseEvent(imageData, index2, element, vp);

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

  it('Should cancel drawing of a CircleTool annotation', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.STACK,
      width: 512,
      height: 128,
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

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      // Since circle draws from center to out, we are picking a very center
      // point in the image  (strip is 255 from 10-15 in X and from 0-64 in Y)
      const index1 = [12, 30, 0];
      const index2 = [14, 40, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = testUtils.createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = testUtils.createNormalizedMouseEvent(imageData, index2, element, vp);

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

      // Cancel the drawing
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
