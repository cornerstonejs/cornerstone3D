import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { performMouseDownAndUp } from '../../../utils/test/testUtilsMouseEvents';

const {
  cache,
  RenderingEngine,
  Enums,
  utilities,
  imageLoader,
  volumeLoader,
  metaData,
  eventTarget,
  setVolumesForViewports,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  BidirectionalTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  cancelActiveManipulations,
  annotation,
} = csTools3d;

const { Events: csToolsEvents } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();

const viewportId = 'VIEWPORT';

function calculateLength(pos1, pos2) {
  const dx = pos1[0] - pos2[0];
  const dy = pos1[1] - pos2[1];
  const dz = pos1[2] - pos2[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const volumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 100,
  columns: 100,
  slices: 10,
  xSpacing: 1,
  ySpacing: 1,
});

describe('Cornerstone Tools: ', () => {
  let renderingEngine;
  let toolGroup;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
      viewportIds: [viewportId],
      tools: [BidirectionalTool],
      toolConfigurations: {
        [BidirectionalTool.toolName]: {
          configuration: { volumeId: volumeId },
        },
      },
      toolActivations: {
        [BidirectionalTool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
    });
    renderingEngine = testEnv.renderingEngine;
    toolGroup = testEnv.toolGroups['default'];
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('Should successfully create a Bidirectional tool on a canvas with mouse drag - 512 x 128', function (done) {
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
      barStart: 32,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    };

    const imageId1 = testUtils.encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

    let p1, p2;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const bidirectionalAnnotations = annotation.state.getAnnotations(
          BidirectionalTool.toolName,
          element
        );
        expect(bidirectionalAnnotations).toBeDefined();
        expect(bidirectionalAnnotations.length).toBe(1);

        const bidirectionalAnnotation = bidirectionalAnnotations[0];
        expect(bidirectionalAnnotation.metadata.toolName).toBe(
          BidirectionalTool.toolName
        );
        expect(bidirectionalAnnotation.invalidated).toBe(false);

        const data = bidirectionalAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].length).toBe(calculateLength(p1, p2));

        annotation.state.removeAnnotation(
          bidirectionalAnnotation.annotationUID
        );
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      setTimeout(() => {
        const index1 = [32, 32, 0];
        const index2 = [10, 1, 0];

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
        p1 = worldCoord1;

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
        p2 = worldCoord2;

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
      }, 300);
    });

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a bidirectional tool on a canvas with mouse drag Volume viewport - 512 x 128', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.ORTHOGRAPHIC,
      width: 512,
      height: 128,
    });

    const vp = renderingEngine.getViewport(viewportId);

    let p1, p2;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const bidirectionalAnnotations = annotation.state.getAnnotations(
          BidirectionalTool.toolName,
          element
        );
        expect(bidirectionalAnnotations).toBeDefined();
        expect(bidirectionalAnnotations.length).toBe(1);

        const bidirectionalAnnotation = bidirectionalAnnotations[0];
        expect(bidirectionalAnnotation.metadata.toolName).toBe(
          BidirectionalTool.toolName
        );
        expect(bidirectionalAnnotation.invalidated).toBe(false);

        const data = bidirectionalAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].length).toBe(calculateLength(p1, p2));

        annotation.state.removeAnnotation(
          bidirectionalAnnotation.annotationUID
        );
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      setTimeout(() => {
        const index1 = [32, 32, 4];
        const index2 = [10, 1, 4];

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
        p1 = worldCoord1;

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
        p2 = worldCoord2;

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
      }, 300);
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

  it('Should successfully create a bidirectional tool and modify its handle', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.STACK,
      width: 256,
      height: 256,
    });

    const imageInfo1 = {
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 50,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    };

    const imageId1 = testUtils.encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

    let p2, p3;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const bidirectionalAnnotations = annotation.state.getAnnotations(
          BidirectionalTool.toolName,
          element
        );
        expect(bidirectionalAnnotations).toBeDefined();
        expect(bidirectionalAnnotations.length).toBe(1);

        const bidirectionalAnnotation = bidirectionalAnnotations[0];
        expect(bidirectionalAnnotation.metadata.referencedImageId).toBe(
          imageId1
        );
        expect(bidirectionalAnnotation.metadata.toolName).toBe(
          BidirectionalTool.toolName
        );
        expect(bidirectionalAnnotation.invalidated).toBe(false);

        const data = bidirectionalAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].length).toBe(calculateLength(p3, p2));

        annotation.state.removeAnnotation(
          bidirectionalAnnotation.annotationUID
        );
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      setTimeout(() => {
        // Not not to move the handle too much since the length become width and it would fail
        const index1 = [50, 50, 0];
        const index2 = [5, 5, 0];
        const index3 = [52, 47, 0];

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
        p2 = worldCoord2;
        const {
          pageX: pageX3,
          pageY: pageY3,
          clientX: clientX3,
          clientY: clientY3,
          worldCoord: worldCoord3,
        } = testUtils.createNormalizedMouseEvent(
          imageData,
          index3,
          element,
          vp
        );
        p3 = worldCoord3;

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
      }, 300);
    });

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a bidirectional tool and select but not move it', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.STACK,
      width: 256,
      height: 256,
    });

    const imageInfo1 = {
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 20,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    };

    const imageId1 = testUtils.encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

    let p1, p2;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const bidirectionalAnnotations = annotation.state.getAnnotations(
          BidirectionalTool.toolName,
          element
        );
        expect(bidirectionalAnnotations).toBeDefined();
        expect(bidirectionalAnnotations.length).toBe(1);

        const bidirectionalAnnotation = bidirectionalAnnotations[0];
        expect(bidirectionalAnnotation.metadata.referencedImageId).toBe(
          imageId1
        );
        expect(bidirectionalAnnotation.metadata.toolName).toBe(
          BidirectionalTool.toolName
        );
        expect(bidirectionalAnnotation.invalidated).toBe(false);

        const data = bidirectionalAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].length).toBe(calculateLength(p1, p2));

        annotation.state.removeAnnotation(
          bidirectionalAnnotation.annotationUID
        );
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      setTimeout(() => {
        const index1 = [20, 20, 0];
        const index2 = [20, 30, 0];

        // grab the tool in its middle (just to make it easy)
        const index3 = [20, 25, 0];

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
        p1 = worldCoord1;
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
        p2 = worldCoord2;

        const {
          pageX: pageX3,
          pageY: pageY3,
          clientX: clientX3,
          clientY: clientY3,
          worldCoord: worldCoord3,
        } = testUtils.createNormalizedMouseEvent(
          imageData,
          index3,
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

        // Mouse down on the middle of the length tool, just to select
        evt = new MouseEvent('mousedown', {
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
          evt,
          mouseUpEvt,
          addEventListenerForAnnotationRendered,
          null,
          false
        );
      }, 300);
    });

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a bidirectional tool and select AND move it', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.STACK,
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

    let p1, p2, p3, p4;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const bidirectionalAnnotations = annotation.state.getAnnotations(
          BidirectionalTool.toolName,
          element
        );
        expect(bidirectionalAnnotations).toBeDefined();
        expect(bidirectionalAnnotations.length).toBe(1);

        const bidirectionalAnnotation = bidirectionalAnnotations[0];
        expect(bidirectionalAnnotation.metadata.referencedImageId).toBe(
          imageId1
        );
        expect(bidirectionalAnnotation.metadata.toolName).toBe(
          BidirectionalTool.toolName
        );
        expect(bidirectionalAnnotation.invalidated).toBe(false);

        const data = bidirectionalAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].length).toBeCloseTo(calculateLength(p1, p2), 6);

        const handles = bidirectionalAnnotation.data.handles.points;

        const preMoveFirstHandle = p1;
        const preMoveSecondHandle = p2;
        const preMoveCenter = p3;

        const centerToHandle1 = [
          preMoveCenter[0] - preMoveFirstHandle[0],
          preMoveCenter[1] - preMoveFirstHandle[1],
          preMoveCenter[2] - preMoveFirstHandle[2],
        ];

        const centerToHandle2 = [
          preMoveCenter[0] - preMoveSecondHandle[0],
          preMoveCenter[1] - preMoveSecondHandle[1],
          preMoveCenter[2] - preMoveSecondHandle[2],
        ];

        const afterMoveCenter = p4;

        const afterMoveFirstHandle = [
          afterMoveCenter[0] - centerToHandle1[0],
          afterMoveCenter[1] - centerToHandle1[1],
          afterMoveCenter[2] - centerToHandle1[2],
        ];

        const afterMoveSecondHandle = [
          afterMoveCenter[0] - centerToHandle2[0],
          afterMoveCenter[1] - centerToHandle2[1],
          afterMoveCenter[2] - centerToHandle2[2],
        ];

        expect(handles[0]).toEqual(afterMoveFirstHandle);
        expect(handles[1]).toEqual(afterMoveSecondHandle);

        annotation.state.removeAnnotation(
          bidirectionalAnnotation.annotationUID
        );
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      setTimeout(() => {
        const index1 = [20, 20, 0];
        const index2 = [20, 30, 0];

        const index3 = [20, 25, 0];

        const index4 = [40, 40, 0];

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
        p1 = worldCoord1;
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
        p2 = worldCoord2;

        const {
          pageX: pageX3,
          pageY: pageY3,
          clientX: clientX3,
          clientY: clientY3,
          worldCoord: worldCoord3,
        } = testUtils.createNormalizedMouseEvent(
          imageData,
          index3,
          element,
          vp
        );
        p3 = worldCoord3;

        const {
          pageX: pageX4,
          pageY: pageY4,
          clientX: clientX4,
          clientY: clientY4,
          worldCoord: worldCoord4,
        } = testUtils.createNormalizedMouseEvent(
          imageData,
          index4,
          element,
          vp
        );
        p4 = worldCoord4;

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

        evt = new MouseEvent('mousedown', {
          target: element,
          buttons: 1,
          clientX: clientX3,
          clientY: clientY3,
          pageX: pageX3,
          pageY: pageY3,
        });
        element.dispatchEvent(evt);

        evt = new MouseEvent('mousemove', {
          target: element,
          buttons: 1,
          clientX: clientX4,
          clientY: clientY4,
          pageX: pageX4,
          pageY: pageY4,
        });
        document.dispatchEvent(evt);

        evt = new MouseEvent('mouseup');

        addEventListenerForAnnotationRendered();
        document.dispatchEvent(evt);
      }, 300);
    });

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully cancel drawing of a BidirectionalTool', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.STACK,
      width: 256,
      height: 256,
    });

    const imageInfo1 = {
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 32,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    };

    const imageId1 = testUtils.encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

    let p1, p2;

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [32, 32, 4];
      const index2 = [10, 1, 4];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = testUtils.createNormalizedMouseEvent(imageData, index1, element, vp);
      p1 = worldCoord1;

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = testUtils.createNormalizedMouseEvent(imageData, index2, element, vp);
      p2 = worldCoord2;

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
        const bidirectionalAnnotations = annotation.state.getAnnotations(
          BidirectionalTool.toolName,
          element
        );
        expect(bidirectionalAnnotations).toBeDefined();
        expect(bidirectionalAnnotations.length).toBe(1);

        const bidirectionalAnnotation = bidirectionalAnnotations[0];
        expect(bidirectionalAnnotation.metadata.referencedImageId).toBe(
          imageId1
        );
        expect(bidirectionalAnnotation.metadata.toolName).toBe(
          BidirectionalTool.toolName
        );
        expect(bidirectionalAnnotation.invalidated).toBe(false);
        expect(bidirectionalAnnotation.highlighted).toBe(false);

        const data = bidirectionalAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].length).toBe(calculateLength(p1, p2));

        annotation.state.removeAnnotation(
          bidirectionalAnnotation.annotationUID
        );
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
