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
  metaData,
  eventTarget,
  volumeLoader,
  setUseCPURendering,
  resetUseCPURendering,
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

const {
  fakeImageLoader,
  fakeVolumeLoader,
  fakeMetaDataProvider,
  createNormalizedMouseEvent,
} = testUtils;

const renderingEngineId = utilities.uuidv4();

const viewportId = 'VIEWPORT';

function calculateLength(pos1, pos2) {
  const dx = pos1[0] - pos2[0];
  const dy = pos1[1] - pos2[1];
  const dz = pos1[2] - pos2[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

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

describe('Bidirectional Tool (CPU): ', () => {
  beforeAll(() => {
    setUseCPURendering(true);
  });

  afterAll(() => {
    resetUseCPURendering();
  });

  beforeEach(function () {
    csTools3d.init();
    csTools3d.addTool(BidirectionalTool);
    this.DOMElements = [];

    cache.purgeCache();
    this.stackToolGroup = ToolGroupManager.createToolGroup('stack');
    this.stackToolGroup.addTool(BidirectionalTool.toolName, {
      configuration: { volumeId: volumeId },
    });
    this.stackToolGroup.setToolActive(BidirectionalTool.toolName, {
      bindings: [{ mouseButton: 1 }],
    });

    this.renderingEngine = new RenderingEngine(renderingEngineId);
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(function () {
    csTools3d.destroy();
    cache.purgeCache();
    eventTarget.reset();

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

  it('Should successfully create a Bidirectional tool on a cpu stack viewport with mouse drag - 512 x 128', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      512,
      128
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    let p1, p2;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const bidirectionalAnnotations = annotation.state.getAnnotations(
          BidirectionalTool.toolName,
          element
        );
        // Can successfully add Length tool to annotationManager
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
      p1 = worldCoord1;

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);
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
    });

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      vp.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a bidirectional tool on a cpu stack viewport and modify its handle', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      256
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    let p2, p3;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const bidirectionalAnnotations = annotation.state.getAnnotations(
          BidirectionalTool.toolName,
          element
        );
        // Can successfully add Length tool to annotationManager
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
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);
      p2 = worldCoord2;
      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, element, vp);
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
    });

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      this.renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a bidirectional tool on a cpu stack viewport and select but not move it', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      256
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    let p1, p2;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const bidirectionalAnnotations = annotation.state.getAnnotations(
          BidirectionalTool.toolName,
          element
        );
        // Can successfully add Length tool to annotationManager
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
      } = createNormalizedMouseEvent(imageData, index1, element, vp);
      p1 = worldCoord1;
      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);
      p2 = worldCoord2;

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
    });

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      this.renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a bidirectional tool on a cpu stack viewport and select AND move it', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      256
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

    let p1, p2, p3, p4;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const bidirectionalAnnotations = annotation.state.getAnnotations(
          BidirectionalTool.toolName,
          element
        );
        // Can successfully add Length tool to annotationManager
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

        // We don't expect the length to change on tool move
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

        // Expect handles are moved accordingly
        expect(handles[0]).toEqual(afterMoveFirstHandle);
        expect(handles[1]).toEqual(afterMoveSecondHandle);

        annotation.state.removeAnnotation(
          bidirectionalAnnotation.annotationUID
        );
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [20, 20, 0];
      const index2 = [20, 30, 0];

      // grab the tool in its middle (just to make it easy)
      const index3 = [20, 25, 0];

      // Where to move the center of the tool
      const index4 = [40, 40, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);
      p1 = worldCoord1;
      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);
      p2 = worldCoord2;

      const {
        pageX: pageX3,
        pageY: pageY3,
        clientX: clientX3,
        clientY: clientY3,
        worldCoord: worldCoord3,
      } = createNormalizedMouseEvent(imageData, index3, element, vp);
      p3 = worldCoord3;

      const {
        pageX: pageX4,
        pageY: pageY4,
        clientX: clientX4,
        clientY: clientY4,
        worldCoord: worldCoord4,
      } = createNormalizedMouseEvent(imageData, index4, element, vp);
      p4 = worldCoord4;

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

      // Drag the middle of the tool
      evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });
      element.dispatchEvent(evt);

      // Move the middle of the tool to point4
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
    });

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      this.renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully cancel drawing of a bidirectional on a cpu stack viewport', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      256
    );
    this.DOMElements.push(element);

    const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
    const vp = this.renderingEngine.getViewport(viewportId);

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
      } = createNormalizedMouseEvent(imageData, index1, element, vp);
      p1 = worldCoord1;

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = createNormalizedMouseEvent(imageData, index2, element, vp);
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
        const bidirectionalAnnotations = annotation.state.getAnnotations(
          BidirectionalTool.toolName,
          element
        );
        // Can successfully add Length tool to annotationManager
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

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);
    element.addEventListener(csToolsEvents.KEY_DOWN, cancelToolDrawing);

    try {
      vp.setStack([imageId1], 0);
      this.renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });
});
