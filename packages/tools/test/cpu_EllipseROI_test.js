import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { encodeImageIdInfo } from '../../../utils/test/testUtils';

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

const AXIAL = 'AXIAL';

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

const imageInfo1 = {
  loader: 'fakeImageLoader',
  name: 'imageURI',
  rows: 64,
  columns: 64,
  barStart: 10,
  barWidth: 5,
  xSpacing: 1,
  ySpacing: 1,
  rgb: 0,
  pt: 0,
  sliceIndex: 0,
};

const volumeId = encodeImageIdInfo(imageInfo1);

describe('EllipticalROITool (CPU):', () => {
  beforeAll(() => {
    setUseCPURendering(true);
  });

  afterAll(() => {
    resetUseCPURendering();
  });

  beforeEach(function () {
    csTools3d.init();
    csTools3d.addTool(EllipticalROITool);
    this.DOMElements = [];

    cache.purgeCache();
    this.stackToolGroup = ToolGroupManager.createToolGroup('stack');
    this.stackToolGroup.addTool(EllipticalROITool.toolName, {
      configuration: { volumeId: volumeId },
    });
    this.stackToolGroup.setToolActive(EllipticalROITool.toolName, {
      bindings: [{ mouseButton: 1 }],
    });

    this.renderingEngine = new RenderingEngine(renderingEngineId);
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(function () {
    this.renderingEngine.disableElement(viewportId);

    csTools3d.destroy();
    eventTarget.reset();
    cache.purgeCache();
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

  it('Should successfully create a ellipse tool on a cpu stack viewport with mouse drag - 512 x 128', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      512,
      128
    );
    this.DOMElements.push(element);

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = this.renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const ellipseAnnotations = annotation.state.getAnnotations(
          EllipticalROITool.toolName,
          element
        );
        // Can successfully add Length tool to annotationManager
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

        // the rectangle is drawn on the strip
        expect(data[targets[0]].mean).toBe(255);

        annotation.state.removeAnnotation(ellipseAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      // Since ellipse draws from center to out, we are picking a very center
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

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      this.renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should cancel drawing of a EllipseTool annotation on a cpu stack viewport', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      512,
      128
    );
    this.DOMElements.push(element);

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = this.renderingEngine.getViewport(viewportId);

    let p1, p2;

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      // Since ellipse draws from center to out, we are picking a very center
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
        const ellipseAnnotations = annotation.state.getAnnotations(
          EllipticalROITool.toolName,
          element
        );
        // Can successfully add Length tool to annotationManager
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

        // the rectangle is drawn on the strip
        expect(data[targets[0]].mean).toBe(255);

        annotation.state.removeAnnotation(ellipseAnnotation.annotationUID);
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
