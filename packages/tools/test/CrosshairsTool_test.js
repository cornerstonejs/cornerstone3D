import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { performMouseDownAndUp } from '../../../utils/test/testUtilsMouseEvents';

const {
  cache,
  RenderingEngine,
  utilities,
  metaData,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  imageLoader,
  getEnabledElement,
} = cornerstone3D;

const { transformWorldToIndex } = utilities;

const { Events, ViewportType } = Enums;

const { unregisterAllImageLoaders } = imageLoader;
const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;
const {
  CrosshairsTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  annotation,
  synchronizers,
} = csTools3d;
const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers;

const { Events: csToolsEvents } = csToolsEnums;

const { fakeMetaDataProvider, fakeVolumeLoader, createNormalizedMouseEvent } =
  testUtils;

const renderingEngineId = utilities.uuidv4();

const viewportId1 = 'VIEWPORT1';
const viewportId2 = 'VIEWPORT2';
const viewportId3 = 'VIEWPORT3';
//
const viewportId4 = 'VIEWPORT4';
const viewportId5 = 'VIEWPORT5';
const viewportId6 = 'VIEWPORT6';

const volumeId = `fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0`;

function createViewports(renderingEngine, viewportType, width, height) {
  const element1 = document.createElement('div');

  element1.style.width = `${width}px`;
  element1.style.height = `${height}px`;
  document.body.appendChild(element1);

  const element2 = document.createElement('div');

  element2.style.width = `${width}px`;
  element2.style.height = `${height}px`;
  document.body.appendChild(element2);

  const element3 = document.createElement('div');

  element3.style.width = `${width}px`;
  element3.style.height = `${height}px`;
  document.body.appendChild(element3);

  return [element1, element2, element3];
}

describe('Cornerstone Tools: ', () => {
  beforeAll(() => {
    // initialize the library
    cornerstone3D.setUseCPURendering(false);
  });

  beforeEach(function () {
    csTools3d.init();
    csTools3d.addTool(CrosshairsTool);
    cache.purgeCache();
    this.DOMElements = [];

    this.testToolGroup = ToolGroupManager.createToolGroup('volume');
    this.testToolGroup.addTool(CrosshairsTool.toolName, {
      configuration: {},
    });

    this.renderingEngine = new RenderingEngine(renderingEngineId);
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(function () {
    csTools3d.destroy();

    cache.purgeCache();
    this.renderingEngine?.destroy();
    metaData.removeProvider(fakeMetaDataProvider);
    unregisterAllImageLoaders();
    ToolGroupManager.destroyToolGroup('volume');

    this.DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  });

  it('Should successfully initialize the crosshairs to the middle of the image and canvas', function (done) {
    const [element1, element2, element3] = createViewports(
      this.renderingEngine,
      ViewportType.ORTHOGRAPHIC,
      512,
      128
    );

    this.renderingEngine.setViewports([
      {
        viewportId: viewportId1,
        type: ViewportType.ORTHOGRAPHIC,
        element: element1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.AXIAL,
        },
      },
      {
        viewportId: viewportId2,
        type: ViewportType.ORTHOGRAPHIC,
        element: element2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.SAGITTAL,
        },
      },
      {
        viewportId: viewportId3,
        type: ViewportType.ORTHOGRAPHIC,
        element: element3,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.CORONAL,
        },
      },
    ]);

    this.DOMElements.push(element1);
    this.DOMElements.push(element2);
    this.DOMElements.push(element3);

    let canvasesRendered = 0;
    let annotationRendered = 0;

    const crosshairsEventHandler = () => {
      annotationRendered += 1;

      if (annotationRendered !== 3) {
        return;
      }

      const vp = this.renderingEngine.getViewport(viewportId1);
      const { imageData } = vp.getImageData();

      const indexMiddle = imageData
        .getDimensions()
        .map((s) => Math.floor(s / 2));

      const imageCenterWorld = imageData.indexToWorld(indexMiddle);

      const { sHeight, sWidth } = vp;
      const centerCanvas = [sWidth * 0.5, sHeight * 0.5];
      const canvasCenterWorld = vp.canvasToWorld(centerCanvas);

      const crosshairAnnotations = annotation.state.getAnnotations(
        CrosshairsTool.toolName,
        element1
      );

      // Can successfully add add crosshairs initial state
      // Todo: right now crosshairs are being initialized on camera reset
      // when crosshair initialization is decoupled from the initial reset
      // There should be no initial state for it
      expect(crosshairAnnotations).toBeDefined();
      expect(crosshairAnnotations.length).toBe(3);

      crosshairAnnotations.map((crosshairAnnotation) => {
        expect(crosshairAnnotation.metadata.cameraFocalPoint).toBeDefined();
        crosshairAnnotation.data.handles.toolCenter.forEach((p, i) => {
          expect(p).toBeCloseTo(canvasCenterWorld[i], 3);
          expect(p).toBeCloseTo(imageCenterWorld[i], 3);
        });
        annotation.state.removeAnnotation(crosshairAnnotation.annotationUID);
      });

      done();
    };

    const renderEventHandler = () => {
      canvasesRendered += 1;

      if (canvasesRendered !== 3) {
        return;
      }

      element1.addEventListener(
        csToolsEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      );
      element2.addEventListener(
        csToolsEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      );
      element3.addEventListener(
        csToolsEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      );

      this.testToolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });
    };

    element1.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    element2.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    element3.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);

    this.testToolGroup.addViewport(viewportId1, this.renderingEngine.id);
    this.testToolGroup.addViewport(viewportId2, this.renderingEngine.id);
    this.testToolGroup.addViewport(viewportId3, this.renderingEngine.id);

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1, viewportId2, viewportId3]
        );
        this.renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully jump to move the crosshairs', function (done) {
    const [element1, element2, element3] = createViewports(
      this.renderingEngine,
      ViewportType.ORTHOGRAPHIC,
      512,
      128
    );

    this.renderingEngine.setViewports([
      {
        viewportId: viewportId1,
        type: ViewportType.ORTHOGRAPHIC,
        element: element1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.AXIAL,
        },
      },
      {
        viewportId: viewportId2,
        type: ViewportType.ORTHOGRAPHIC,
        element: element2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.SAGITTAL,
        },
      },
      {
        viewportId: viewportId3,
        type: ViewportType.ORTHOGRAPHIC,
        element: element3,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.CORONAL,
        },
      },
    ]);

    this.DOMElements.push(element1);
    this.DOMElements.push(element2);
    this.DOMElements.push(element3);

    let canvasesRendered = 0;
    let annotationRendered = 0;

    let p1;

    const crosshairsEventHandler = () => {
      annotationRendered += 1;

      if (annotationRendered !== 3) {
        return;
      }

      const crosshairAnnotationsAfter = annotation.state.getAnnotations(
        CrosshairsTool.toolName,
        element1
      );
      const axialCanvasToolCenter =
        crosshairAnnotationsAfter[0].data.handles.toolCenter;

      crosshairAnnotationsAfter.map((crosshairAnnotation) => {
        expect(crosshairAnnotation.metadata.cameraFocalPoint).toBeDefined();
        crosshairAnnotation.data.handles.toolCenter.forEach((p, i) => {
          // Can successfully move the tool center in all viewports
          expect(p).toBeCloseTo(p1[i], 3);
          expect(p).toBeCloseTo(axialCanvasToolCenter[i], 3);
          annotation.state.removeAnnotation(crosshairAnnotation.annotationUID);
        });
      });
      done();
    };

    const attachCrosshairsHandler = () => {
      element1.addEventListener(
        csToolsEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      );
      element2.addEventListener(
        csToolsEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      );
      element3.addEventListener(
        csToolsEvents.ANNOTATION_RENDERED,
        crosshairsEventHandler
      );
    };

    const eventHandler = () => {
      canvasesRendered += 1;

      if (canvasesRendered !== 3) {
        return;
      }

      this.testToolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });

      const vp1 = this.renderingEngine.getViewport(viewportId1);
      const { imageData } = vp1.getImageData();

      const crosshairAnnotations = annotation.state.getAnnotations(
        CrosshairsTool.toolName,
        element1
      );

      // First viewport is axial
      const currentWorldLocation =
        crosshairAnnotations[0].data.handles.toolCenter;
      const currentIndexLocation = transformWorldToIndex(
        imageData,
        currentWorldLocation
      );

      const jumpIndexLocation = [
        currentIndexLocation[0] + 20,
        currentIndexLocation[1] + 20,
        currentIndexLocation[2],
      ];

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(
        imageData,
        jumpIndexLocation,
        element1,
        vp1
      );
      p1 = worldCoord1;

      // Mouse Down
      const mouseDownEvt = new MouseEvent('mousedown', {
        target: element1,
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      });

      // Mouse Up instantly after
      const mouseUpEvt = new MouseEvent('mouseup');

      performMouseDownAndUp(
        element1,
        mouseDownEvt,
        mouseUpEvt,
        attachCrosshairsHandler
      );
    };

    element1.addEventListener(Events.IMAGE_RENDERED, eventHandler);
    element2.addEventListener(Events.IMAGE_RENDERED, eventHandler);
    element3.addEventListener(Events.IMAGE_RENDERED, eventHandler);

    this.testToolGroup.addViewport(viewportId1, this.renderingEngine.id);
    this.testToolGroup.addViewport(viewportId2, this.renderingEngine.id);
    this.testToolGroup.addViewport(viewportId3, this.renderingEngine.id);

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1, viewportId2, viewportId3]
        );
        this.renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully drag and move the crosshairs', function (done) {
    const [element1, element2, element3] = createViewports(
      this.renderingEngine,
      ViewportType.ORTHOGRAPHIC,
      512,
      128
    );

    this.renderingEngine.setViewports([
      {
        viewportId: viewportId1,
        type: ViewportType.ORTHOGRAPHIC,
        element: element1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.AXIAL,
        },
      },
      {
        viewportId: viewportId2,
        type: ViewportType.ORTHOGRAPHIC,
        element: element2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.SAGITTAL,
        },
      },
      {
        viewportId: viewportId3,
        type: ViewportType.ORTHOGRAPHIC,
        element: element3,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.CORONAL,
        },
      },
    ]);

    this.DOMElements.push(element1);
    this.DOMElements.push(element2);
    this.DOMElements.push(element3);

    let canvasesRendered = 0;

    const eventHandler = () => {
      canvasesRendered += 1;

      if (canvasesRendered !== 3) {
        return;
      }

      this.testToolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });

      const vp1 = this.renderingEngine.getViewport(viewportId1);
      const { imageData } = vp1.getImageData();

      setTimeout(() => {
        const crosshairAnnotations = annotation.state.getAnnotations(
          CrosshairsTool.toolName,
          element1
        );

        // First viewport is axial
        const currentWorldLocation =
          crosshairAnnotations[0].data.handles.toolCenter;
        const currentIndexLocation = transformWorldToIndex(
          imageData,
          currentWorldLocation
        );

        const jumpIndexLocation = [
          currentIndexLocation[0] - 20,
          currentIndexLocation[1] - 20,
          currentIndexLocation[2],
        ];

        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
          worldCoord: worldCoord1,
        } = createNormalizedMouseEvent(
          imageData,
          currentIndexLocation,
          element1,
          vp1
        );

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
          worldCoord: worldCoord2,
        } = createNormalizedMouseEvent(
          imageData,
          jumpIndexLocation,
          element1,
          vp1
        );

        // Mouse Down
        let evt = new MouseEvent('mousedown', {
          target: element1,
          buttons: 1,
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
        });
        element1.dispatchEvent(evt);

        // Mouse move to put the end somewhere else
        evt = new MouseEvent('mousemove', {
          target: element1,
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

        // Moving Crosshairs
        setTimeout(() => {
          const crosshairAnnotationsAfter = annotation.state.getAnnotations(
            CrosshairsTool.toolName,
            element1
          );
          crosshairAnnotationsAfter.map((crosshairAnnotation) => {
            expect(crosshairAnnotation.metadata.cameraFocalPoint).toBeDefined();
            crosshairAnnotation.data.handles.toolCenter.forEach((p, i) => {
              // Can successfully move the tool center in all viewports
              expect(p).toBeCloseTo(worldCoord2[i], 3);
              annotation.state.removeAnnotation(
                crosshairAnnotation.annotationUID
              );
            });
          });
          done();
        }, 50);
      }, 50);
    };

    element1.addEventListener(Events.IMAGE_RENDERED, eventHandler);
    element2.addEventListener(Events.IMAGE_RENDERED, eventHandler);
    element3.addEventListener(Events.IMAGE_RENDERED, eventHandler);

    this.testToolGroup.addViewport(viewportId1, this.renderingEngine.id);
    this.testToolGroup.addViewport(viewportId2, this.renderingEngine.id);
    this.testToolGroup.addViewport(viewportId3, this.renderingEngine.id);

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1, viewportId2, viewportId3]
        );
        this.renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });
});

describe('Crosshairs with synchronizers: ', () => {
  beforeAll(() => {
    // initialize the library
    cornerstone3D.setUseCPURendering(false);
  });

  beforeEach(function () {
    csTools3d.init();
    csTools3d.addTool(CrosshairsTool);
    cache.purgeCache();
    this.DOMElements = [];

    this.testToolGroup = ToolGroupManager.createToolGroup('volume');
    this.testToolGroup.addTool(CrosshairsTool.toolName, {
      configuration: {},
    });
    this.testToolGroup1 = ToolGroupManager.createToolGroup('volume1');
    this.testToolGroup1.addTool(CrosshairsTool.toolName, {
      configuration: {},
    });

    this.renderingEngine = new RenderingEngine(renderingEngineId);
    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(function () {
    csTools3d.destroy();

    cache.purgeCache();
    this.renderingEngine?.destroy();
    metaData.removeProvider(fakeMetaDataProvider);
    unregisterAllImageLoaders();
    ToolGroupManager.destroyToolGroup('volume');
    ToolGroupManager.destroyToolGroup('volume1');

    this.DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  });

  it('Should be able to have two separate crosshairs for different toolGroups', function (done) {
    const [element1, element2, element3] = createViewports(
      this.renderingEngine,
      ViewportType.ORTHOGRAPHIC,
      512,
      128
    );
    const [element4, element5, element6] = createViewports(
      this.renderingEngine,
      ViewportType.ORTHOGRAPHIC,
      512,
      128
    );

    this.DOMElements.push(element1);
    this.DOMElements.push(element2);
    this.DOMElements.push(element3);
    this.DOMElements.push(element4);
    this.DOMElements.push(element5);
    this.DOMElements.push(element6);

    this.renderingEngine.setViewports([
      {
        viewportId: viewportId1,
        type: ViewportType.ORTHOGRAPHIC,
        element: element1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.AXIAL,
        },
      },
      {
        viewportId: viewportId2,
        type: ViewportType.ORTHOGRAPHIC,
        element: element2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.SAGITTAL,
        },
      },
      {
        viewportId: viewportId3,
        type: ViewportType.ORTHOGRAPHIC,
        element: element3,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.CORONAL,
        },
      },
      {
        viewportId: viewportId4,
        type: ViewportType.ORTHOGRAPHIC,
        element: element4,
        defaultOptions: {
          background: [0, 0, 1],
          orientation: Enums.OrientationAxis.AXIAL,
        },
      },
      {
        viewportId: viewportId5,
        type: ViewportType.ORTHOGRAPHIC,
        element: element5,
        defaultOptions: {
          background: [0, 0, 1],
          orientation: Enums.OrientationAxis.SAGITTAL,
        },
      },
      {
        viewportId: viewportId6,
        type: ViewportType.ORTHOGRAPHIC,
        element: element6,
        defaultOptions: {
          background: [0, 0, 1],
          orientation: Enums.OrientationAxis.CORONAL,
        },
      },
    ]);

    let canvasesRendered = 0;
    const renderEventHandler = () => {
      canvasesRendered += 1;

      if (canvasesRendered !== 6) {
        return;
      }

      this.testToolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });
      this.testToolGroup1.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });

      setTimeout(() => {
        // get the toolCenter for the third viewport
        const vp4 = this.renderingEngine.getViewport(viewportId3);
        const crosshairAnnotations = annotation.state.getAnnotations(
          CrosshairsTool.toolName,
          element4
        );

        // find the annotation for vp3
        const annotationForVp4 = crosshairAnnotations.find((annotation) => {
          return annotation.data.viewportId === vp4.id;
        });

        const toolCenter = annotationForVp4.data.handles.toolCenter;

        // click on the first viewport
        const index1 = [32, 32, 0];

        const vp1 = this.renderingEngine.getViewport(viewportId1);
        const { imageData } = vp1.getImageData();
        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
        } = createNormalizedMouseEvent(imageData, index1, element1, vp1);

        // Mouse Down
        let evt = new MouseEvent('mousedown', {
          target: element1,
          buttons: 1,
          clientX: clientX1,
          clientY: clientY1,
          pageX: pageX1,
          pageY: pageY1,
        });
        element1.dispatchEvent(evt);
        evt = new MouseEvent('mouseup');
        document.dispatchEvent(evt);

        setTimeout(() => {
          // get the vp4 toolCenter and it should have been not changed
          const vp4ToolCenter = annotation.state
            .getAnnotations(CrosshairsTool.toolName, element4)
            .find((annotation) => {
              return annotation.data.viewportId === vp4.id;
            });

          vp4ToolCenter.data.handles.toolCenter.forEach((p, i) => {
            expect(p).toBeCloseTo(toolCenter[i], 3);
          });

          done();
        }, 1000);

        // done();
      }, 500);
    };

    element1.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    element2.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    element3.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);

    element4.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    element5.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    element6.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);

    this.testToolGroup.addViewport(viewportId1, this.renderingEngine.id);
    this.testToolGroup.addViewport(viewportId2, this.renderingEngine.id);
    this.testToolGroup.addViewport(viewportId3, this.renderingEngine.id);

    this.testToolGroup1.addViewport(viewportId4, this.renderingEngine.id);
    this.testToolGroup1.addViewport(viewportId5, this.renderingEngine.id);
    this.testToolGroup1.addViewport(viewportId6, this.renderingEngine.id);

    this.renderingEngine.render();
    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1, viewportId2, viewportId3]
        );
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId4, viewportId5, viewportId6]
        );
        this.renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully work with camera synchronizers on', function (done) {
    const [element1, element2, element3] = createViewports(
      this.renderingEngine,
      ViewportType.ORTHOGRAPHIC,
      512,
      128
    );
    const [element4, element5, element6] = createViewports(
      this.renderingEngine,
      ViewportType.ORTHOGRAPHIC,
      512,
      128
    );

    this.DOMElements.push(element1);
    this.DOMElements.push(element2);
    this.DOMElements.push(element3);
    this.DOMElements.push(element4);
    this.DOMElements.push(element5);
    this.DOMElements.push(element6);

    this.renderingEngine.setViewports([
      {
        viewportId: viewportId1,
        type: ViewportType.ORTHOGRAPHIC,
        element: element1,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.AXIAL,
        },
      },
      {
        viewportId: viewportId2,
        type: ViewportType.ORTHOGRAPHIC,
        element: element2,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.SAGITTAL,
        },
      },
      {
        viewportId: viewportId3,
        type: ViewportType.ORTHOGRAPHIC,
        element: element3,
        defaultOptions: {
          background: [1, 0, 1], // pinkish background
          orientation: Enums.OrientationAxis.CORONAL,
        },
      },
      {
        viewportId: viewportId4,
        type: ViewportType.ORTHOGRAPHIC,
        element: element4,
        defaultOptions: {
          background: [0, 0, 1],
          orientation: Enums.OrientationAxis.AXIAL,
        },
      },
      {
        viewportId: viewportId5,
        type: ViewportType.ORTHOGRAPHIC,
        element: element5,
        defaultOptions: {
          background: [0, 0, 1],
          orientation: Enums.OrientationAxis.SAGITTAL,
        },
      },
      {
        viewportId: viewportId6,
        type: ViewportType.ORTHOGRAPHIC,
        element: element6,
        defaultOptions: {
          background: [0, 0, 1],
          orientation: Enums.OrientationAxis.CORONAL,
        },
      },
    ]);

    let canvasesRendered = 0;
    const renderEventHandler = () => {
      canvasesRendered += 1;

      if (canvasesRendered !== 6) {
        return;
      }

      this.testToolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });
      this.testToolGroup1.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });

      setTimeout(() => {
        // get the toolCenter for the third viewport
        const vp5 = this.renderingEngine.getViewport(viewportId5);
        const crosshairAnnotations = annotation.state.getAnnotations(
          CrosshairsTool.toolName,
          element5
        );

        // find the annotation for vp3
        const annotationForVp5 = crosshairAnnotations.find((annotation) => {
          return annotation.data.viewportId === vp5.id;
        });

        const oldToolCenter = JSON.parse(
          JSON.stringify(annotationForVp5.data.handles.toolCenter)
        );

        // click on the first viewport
        const index1 = [32, 32, 0];

        const vp3 = this.renderingEngine.getViewport(viewportId3);
        const { imageData } = vp3.getImageData();
        const {
          pageX: pageX1,
          pageY: pageY1,
          clientX: clientX1,
          clientY: clientY1,
        } = createNormalizedMouseEvent(imageData, index1, element3, vp3);

        // Mouse Down
        let evt = new MouseEvent('mousedown', {
          target: element3,
          buttons: 1,
          clientX: clientX1,
          clientY: clientY1,
          pageX: pageX1,
          pageY: pageY1,
        });
        element3.dispatchEvent(evt);
        evt = new MouseEvent('mouseup');
        document.dispatchEvent(evt);

        setTimeout(() => {
          // get the vp5 toolCenter should have changed
          const vp5ToolCenter = annotation.state
            .getAnnotations(CrosshairsTool.toolName, element5)
            .find((annotation) => {
              return annotation.data.viewportId === vp5.id;
            });

          expect(vp5ToolCenter.data.handles.toolCenter[2]).not.toBeCloseTo(
            oldToolCenter[2],
            3
          );

          done();
        }, 500);

        // done();
      }, 500);
    };

    element1.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    element2.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    element3.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);

    element4.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    element5.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);
    element6.addEventListener(Events.IMAGE_RENDERED, renderEventHandler);

    this.testToolGroup.addViewport(viewportId1, this.renderingEngine.id);
    this.testToolGroup.addViewport(viewportId2, this.renderingEngine.id);
    this.testToolGroup.addViewport(viewportId3, this.renderingEngine.id);

    this.testToolGroup1.addViewport(viewportId4, this.renderingEngine.id);
    this.testToolGroup1.addViewport(viewportId5, this.renderingEngine.id);
    this.testToolGroup1.addViewport(viewportId6, this.renderingEngine.id);

    const axialSync = createCameraPositionSynchronizer('axialSync');

    axialSync.add({
      renderingEngineId: this.renderingEngine.id,
      viewportId: this.renderingEngine.getViewport(viewportId1).id,
    });
    axialSync.add({
      renderingEngineId: this.renderingEngine.id,
      viewportId: this.renderingEngine.getViewport(viewportId4).id,
    });

    this.renderingEngine.render();
    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1, viewportId2, viewportId3]
        );
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId4, viewportId5, viewportId6]
        );
        this.renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
