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
} = csTools3d;

const { Events: csToolsEvents } = csToolsEnums;

const { fakeMetaDataProvider, fakeVolumeLoader, createNormalizedMouseEvent } =
  testUtils;

const renderingEngineId = utilities.uuidv4();

const viewportId1 = 'VIEWPORT1';
const viewportId2 = 'VIEWPORT2';
const viewportUID3 = 'VIEWPORT3';

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

  renderingEngine.setViewports([
    {
      viewportId: viewportId1,
      type: viewportType,
      element: element1,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportId2,
      type: viewportType,
      element: element2,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportUID3,
      type: viewportType,
      element: element3,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
  ]);
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
    this.renderingEngine.destroy();
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
        element1,
        CrosshairsTool.toolName
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
        annotation.state.removeAnnotation(
          crosshairAnnotation.annotationUID,
          element1
        );
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
    this.testToolGroup.addViewport(viewportUID3, this.renderingEngine.id);

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1, viewportId2, viewportUID3]
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
        element1,
        CrosshairsTool.toolName
      );
      const axialCanvasToolCenter =
        crosshairAnnotationsAfter[0].data.handles.toolCenter;

      crosshairAnnotationsAfter.map((crosshairAnnotation) => {
        expect(crosshairAnnotation.metadata.cameraFocalPoint).toBeDefined();
        crosshairAnnotation.data.handles.toolCenter.forEach((p, i) => {
          // Can successfully move the tool center in all viewports
          expect(p).toBeCloseTo(p1[i], 3);
          expect(p).toBeCloseTo(axialCanvasToolCenter[i], 3);
          annotation.state.removeAnnotation(
            crosshairAnnotation.annotationUID,
            element1
          );
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
        element1,
        CrosshairsTool.toolName
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
    this.testToolGroup.addViewport(viewportUID3, this.renderingEngine.id);

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1, viewportId2, viewportUID3]
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
          element1,
          CrosshairsTool.toolName
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
            element1,
            CrosshairsTool.toolName
          );
          crosshairAnnotationsAfter.map((crosshairAnnotation) => {
            expect(crosshairAnnotation.metadata.cameraFocalPoint).toBeDefined();
            crosshairAnnotation.data.handles.toolCenter.forEach((p, i) => {
              // Can successfully move the tool center in all viewports
              expect(p).toBeCloseTo(worldCoord2[i], 3);
              annotation.state.removeAnnotation(
                crosshairAnnotation.annotationUID,
                element1
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
    this.testToolGroup.addViewport(viewportUID3, this.renderingEngine.id);

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        setVolumesForViewports(
          this.renderingEngine,
          [{ volumeId: volumeId }],
          [viewportId1, viewportId2, viewportUID3]
        );
        this.renderingEngine.render();
      });
    } catch (e) {
      done.fail(e);
    }
  });
});
