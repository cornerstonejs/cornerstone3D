import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { performMouseDownAndUp } from '../../../utils/test/testUtilsMouseEvents';
import { encodeImageIdInfo } from '../../../utils/test/testUtils';

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
  getEnabledElement,
} = cornerstone3D;

const { Events, ViewportType, CalibrationTypes } = Enums;

const {
  LengthTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  cancelActiveManipulations,
  annotation,
  utilities: toolsUtilities,
} = csTools3d;

const { calibrateImageSpacing } = toolsUtilities;

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

const volumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 100,
  columns: 100,
  slices: 10,
  xSpacing: 1,
  ySpacing: 1,
});

/** Test that the calibration works as expected when provided a calibrated
 * scale value.
 */
describe('Calibration ', () => {
  const FOR = 'for';

  beforeEach(function () {
    csTools3d.init();
    csTools3d.addTool(LengthTool);
    cache.purgeCache();
    this.DOMElements = [];
    this.stackToolGroup = ToolGroupManager.createToolGroup('stack');
    this.stackToolGroup.addTool(LengthTool.toolName, {
      configuration: {},
    });
    this.stackToolGroup.setToolActive(LengthTool.toolName, {
      bindings: [{ mouseButton: 1 }],
    });

    this.renderingEngine = new RenderingEngine(renderingEngineId);
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
    metaData.addProvider(
      utilities.calibratedPixelSpacingMetadataProvider.get.bind(
        utilities.calibratedPixelSpacingMetadataProvider
      ),
      11000
    );
  });

  afterEach(function () {
    try {
      csTools3d.destroy();
      eventTarget.reset();
      cache.purgeCache();
      this.renderingEngine.destroy();
      metaData.removeProvider(fakeMetaDataProvider);
      imageLoader.unregisterAllImageLoaders();
      ToolGroupManager.destroyToolGroup('stack');

      if (this.DOMElements) {
        this.DOMElements.forEach((el) => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
        // remove any element that is svg layer and remove any other element that is canvas
        const svgElements = document.querySelectorAll('svg');
        svgElements.forEach((el) => {
          el.parentNode.removeChild(el);
        });
        const canvasElements = document.querySelectorAll('canvas');
        canvasElements.forEach((el) => {
          el.parentNode.removeChild(el);
        });
      }
    } catch (e) {
      console.warn(e);
    }
  });

  it('Should be able to calibrate an image and update the tool', function (done) {
    const element = createViewport(
      this.renderingEngine,
      ViewportType.STACK,
      256,
      256
    );
    this.DOMElements.push(element);

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

    const vp = this.renderingEngine.getViewport(viewportId);
    const scale = 1.5;
    const index1 = [32, 32, 0];
    const index2 = [10, 1, 0];

    const secondCallback = () => {
      // Add a small delay before checking the annotation
      setTimeout(() => {
        const lengthAnnotations = annotation.state.getAnnotations(
          LengthTool.toolName,
          element
        );
        //  Can successfully add Length tool to annotationManager
        expect(lengthAnnotations).toBeDefined();
        expect(lengthAnnotations.length).toBe(1);

        const lengthAnnotation = lengthAnnotations[0];
        expect(lengthAnnotation.metadata.toolName).toBe(LengthTool.toolName);
        expect(lengthAnnotation.invalidated).toBe(false);
        expect(lengthAnnotation.highlighted).toBe(true);

        const data = lengthAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].length).toBeCloseTo(
          calculateLength(index1, index2) / scale,
          0.05
        );

        annotation.state.removeAnnotation(lengthAnnotation.annotationUID);
        done();
      }, 100); // Add a 100ms delay
    };

    const firstCallback = () => {
      element.removeEventListener(Events.IMAGE_RENDERED, firstCallback);
      element.addEventListener(Events.IMAGE_RENDERED, secondCallback);

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

      // Mouse Up instantly after
      evt = new MouseEvent('mouseup');

      // Since there is tool rendering happening for any mouse event
      // we just attach a listener before the last one -> mouse up
      document.dispatchEvent(evt);

      const imageId = this.renderingEngine
        .getViewport(viewportId)
        .getCurrentImageId();

      calibrateImageSpacing(imageId, this.renderingEngine, {
        type: CalibrationTypes.USER,
        scale,
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, firstCallback);

    this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      this.renderingEngine.render();
    } catch (e) {
      console.warn('Calibrate failed:', e);
      done.fail(e);
    }
  });
});
