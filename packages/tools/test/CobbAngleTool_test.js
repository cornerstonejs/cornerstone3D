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
  eventTarget,
  utilities,
  imageLoader,
  metaData,
  volumeLoader,
  setVolumesForViewports,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  CobbAngleTool,
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
  slices: 10,
  xSpacing: 1,
  ySpacing: 1,
});

describe('CobbAngleTool:', () => {
  let renderingEngine;
  let toolGroup;

  beforeEach(async () => {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['volume'],
      viewportIds: [viewportId],
      tools: [CobbAngleTool],
      toolConfigurations: {
        [CobbAngleTool.toolName]: {
          configuration: { volumeId: volumeId },
        },
      },
      toolActivations: {
        [CobbAngleTool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
    });

    renderingEngine = testEnv.renderingEngine;
    toolGroup = testEnv.toolGroups['volume'];
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['volume'],
    });
  });

  it('Should successfully create a Cobb angle tool with angle less than 90 degrees on a canvas with mouse drag - 512 x 128', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.ORTHOGRAPHIC,
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

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const cobbAngleAnnotations = annotation.state.getAnnotations(
          CobbAngleTool.toolName,
          element
        );
        expect(cobbAngleAnnotations).toBeDefined();
        expect(cobbAngleAnnotations.length).toBe(1);

        const cobbAngleAnnotation = cobbAngleAnnotations[0];
        // expect(cobbAngleAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(cobbAngleAnnotation.metadata.toolName).toBe(
          CobbAngleTool.toolName
        );
        expect(cobbAngleAnnotation.invalidated).toBe(false);

        const data = cobbAngleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(Math.round(data[targets[0]].angle)).toBe(30);
        annotation.state.removeAnnotation(cobbAngleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [32, 32, 0];
      const index2 = [index1[0] + 35 * Math.sqrt(3), index1[1], 0];
      const index3 = [index1[0] + 5, index1[1] - 3, 0];
      const index4 = [index3[0] + 35 * Math.sqrt(3), index3[1] + 35, 0];

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

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
      } = testUtils.createNormalizedMouseEvent(imageData, index3, element, vp);

      const {
        pageX: pageX4,
        pageY: pageY4,
        clientX: clientX4,
        clientY: clientY4,
      } = testUtils.createNormalizedMouseEvent(imageData, index4, element, vp);

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

      // Mouse Down
      evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });
      element.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX4,
        clientY: clientY4,
        pageX: pageX4,
        pageY: pageY4,
      });
      document.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');

      // Since there is tool rendering happening for any mouse event
      // we just attach a listener before the last one -> mouse up
      addEventListenerForAnnotationRendered();
      document.dispatchEvent(evt);
    });

    try {
      volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId]
        ).then(() => {
          vp.render();
        });
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a Cobb Angle tool with angle greater than 90 degrees on a canvas with mouse clicks in a Volume viewport - 512 x 128', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.ORTHOGRAPHIC,
      width: 512,
      height: 128,
    });

    const vp = renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const cobbAngleAnnotations = annotation.state.getAnnotations(
          CobbAngleTool.toolName,
          element
        );
        expect(cobbAngleAnnotations).toBeDefined();
        expect(cobbAngleAnnotations.length).toBe(1);

        const cobbAngleAnnotation = cobbAngleAnnotations[0];
        expect(cobbAngleAnnotation.metadata.toolName).toBe(
          CobbAngleTool.toolName
        );
        expect(cobbAngleAnnotation.invalidated).toBe(false);
        expect(cobbAngleAnnotation.highlighted).toBe(true);

        const data = cobbAngleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(Math.round(data[targets[0]].angle)).toBe(135);

        annotation.state.removeAnnotation(cobbAngleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, async () => {
      const index1 = [200, 75, 4];
      const index2 = [index1[0] + 42, index1[1] + 42, 4];
      const index3 = [index1[0] - 13, index1[1] + 10, 4];
      const index4 = [index3[0], index3[1] - 42, 4];

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

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
      } = testUtils.createNormalizedMouseEvent(imageData, index3, element, vp);

      const {
        pageX: pageX4,
        pageY: pageY4,
        clientX: clientX4,
        clientY: clientY4,
      } = testUtils.createNormalizedMouseEvent(imageData, index4, element, vp);

      // Mouse Down
      let mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });

      // Mouse Up instantly after
      let mouseUpEvt = new MouseEvent('mouseup');

      await performMouseDownAndUp(element, mouseDownEvt, mouseUpEvt);

      // Mouse down to put the end somewhere else
      mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });

      // Mouse Up instantly after
      mouseUpEvt = new MouseEvent('mouseup');

      await performMouseDownAndUp(element, mouseDownEvt, mouseUpEvt);

      // Mouse Down
      mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });

      // Mouse Up instantly after
      mouseUpEvt = new MouseEvent('mouseup');

      await performMouseDownAndUp(element, mouseDownEvt, mouseUpEvt);

      // Mouse down to put the end somewhere else
      mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX4,
        clientY: clientY4,
        pageX: pageX4,
        pageY: pageY4,
      });

      // Mouse Up instantly after
      mouseUpEvt = new MouseEvent('mouseup');

      performMouseDownAndUp(
        element,
        mouseDownEvt,
        mouseUpEvt,
        addEventListenerForAnnotationRendered
      );
    });

    try {
      volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId]
        ).then(() => {
          vp.render();
        });
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a Cobb Angle tool with combined clicks and drag and modify its handle', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.ORTHOGRAPHIC,
      width: 256,
      height: 256,
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

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const cobbAngleAnnotations = annotation.state.getAnnotations(
          CobbAngleTool.toolName,
          element
        );
        expect(cobbAngleAnnotations).toBeDefined();
        expect(cobbAngleAnnotations.length).toBe(1);

        const cobbAngleAnnotation = cobbAngleAnnotations[0];
        // expect(cobbAngleAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(cobbAngleAnnotation.metadata.toolName).toBe(
          CobbAngleTool.toolName
        );
        expect(cobbAngleAnnotation.invalidated).toBe(false);
        expect(cobbAngleAnnotation.highlighted).toBe(true);

        const data = cobbAngleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(Math.round(data[targets[0]].angle)).toBe(22);

        annotation.state.removeAnnotation(cobbAngleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, async () => {
      const index1 = [50, 50, 0];
      const index2 = [75, 50, 0];
      const index3 = [50, 35, 0];
      const index4 = [75, 35, 0];
      const index5 = [75, 60, 0];

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

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
      } = testUtils.createNormalizedMouseEvent(imageData, index3, element, vp);

      const {
        pageX: pageX4,
        pageY: pageY4,
        clientX: clientX4,
        clientY: clientY4,
      } = testUtils.createNormalizedMouseEvent(imageData, index4, element, vp);

      const {
        pageX: pageX5,
        pageY: pageY5,
        clientX: clientX5,
        clientY: clientY5,
      } = testUtils.createNormalizedMouseEvent(imageData, index5, element, vp);

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

      // Drag for the first segment.

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

      // Click for the second segment.

      // Mouse Down
      let mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });

      // Mouse Up instantly after
      let mouseUpEvt = new MouseEvent('mouseup');

      await performMouseDownAndUp(element, mouseDownEvt, mouseUpEvt);

      // Mouse down to put the end somewhere else
      mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX4,
        clientY: clientY4,
        pageX: pageX4,
        pageY: pageY4,
      });

      // Mouse Up instantly after
      mouseUpEvt = new MouseEvent('mouseup');

      await performMouseDownAndUp(element, mouseDownEvt, mouseUpEvt);

      // Select the second handle (i.e. second point of the first segment)
      evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });
      element.dispatchEvent(evt);

      // Drag it somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX5,
        clientY: clientY5,
        pageX: pageX5,
        pageY: pageY5,
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
        ).then(() => {
          vp.render();
        });
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a Cobb angle tool with combined clicks and drags and select but not move it', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.ORTHOGRAPHIC,
      width: 256,
      height: 256,
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

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const cobbAngleAnnotations = annotation.state.getAnnotations(
          CobbAngleTool.toolName,
          element
        );
        expect(cobbAngleAnnotations).toBeDefined();
        expect(cobbAngleAnnotations.length).toBe(1);

        const cobbAngleAnnotation = cobbAngleAnnotations[0];
        // expect(cobbAngleAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(cobbAngleAnnotation.metadata.toolName).toBe(
          CobbAngleTool.toolName
        );
        expect(cobbAngleAnnotation.invalidated).toBe(false);
        expect(cobbAngleAnnotation.highlighted).toBe(true);

        const data = cobbAngleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(Math.round(data[targets[0]].angle)).toBe(0);

        annotation.state.removeAnnotation(cobbAngleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, async () => {
      const index1 = [20, 20, 0];
      const index2 = [20, 30, 0];
      const index3 = [40, 20, 0];
      const index4 = [40, 37, 0];

      // grab the tool in the middle of the second segment
      const index5 = [20, 25, 0];

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

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
      } = testUtils.createNormalizedMouseEvent(imageData, index3, element, vp);

      const {
        pageX: pageX4,
        pageY: pageY4,
        clientX: clientX4,
        clientY: clientY4,
      } = testUtils.createNormalizedMouseEvent(imageData, index4, element, vp);

      const {
        pageX: pageX5,
        pageY: pageY5,
        clientX: clientX5,
        clientY: clientY5,
      } = testUtils.createNormalizedMouseEvent(imageData, index5, element, vp);

      // Clicks for the first segment

      // Mouse Down
      let mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });

      // Mouse Up instantly after
      let mouseUpEvt = new MouseEvent('mouseup');

      await performMouseDownAndUp(element, mouseDownEvt, mouseUpEvt);

      // Mouse down to put the end somewhere else
      mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX2,
        clientY: clientY2,
        pageX: pageX2,
        pageY: pageY2,
      });

      // Mouse Up instantly after
      mouseUpEvt = new MouseEvent('mouseup');

      await performMouseDownAndUp(element, mouseDownEvt, mouseUpEvt);

      // Drags for the second segment.

      // Mouse Down
      let evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });
      element.dispatchEvent(evt);

      // Mouse move to put the end somewhere else
      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX4,
        clientY: clientY4,
        pageX: pageX4,
        pageY: pageY4,
      });
      document.dispatchEvent(evt);

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');
      document.dispatchEvent(evt);

      // Mouse down on the middle of the Cobb Angle tool, just to select
      mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX5,
        clientY: clientY5,
        pageX: pageX5,
        pageY: pageY5,
      });

      // Just grab and don't really move it
      mouseUpEvt = new MouseEvent('mouseup');

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
      volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId]
        ).then(() => {
          vp.render();
        });
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
