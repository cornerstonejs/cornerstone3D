import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
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
  metaData,
  eventTarget,
  volumeLoader,
  setVolumesForViewports,
  getEnabledElement,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  EllipticalROITool,
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
});

describe('Ellipse Tool: ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Ellipse Tool: ', () => {
    let testEnv;
    let renderingEngine;

    beforeEach(function () {
      testEnv = testUtils.setupTestEnvironment({
        renderingEngineId: renderingEngineId,
        toolGroupIds: ['stack'],
        tools: [EllipticalROITool],
        toolActivations: {
          [EllipticalROITool.toolName]: {
            bindings: [{ mouseButton: 1 }],
          },
        },
        viewportIds: [viewportId],
      });

      renderingEngine = testEnv.renderingEngine;
    });

    afterEach(function () {
      testUtils.cleanupTestEnvironment({
        renderingEngineId: renderingEngineId,
        toolGroupIds: ['stack'],
        cleanupDOMElements: true,
      });
    });

    it('Should successfully create a ellipse tool on a canvas with mouse drag - 512 x 128', function (done) {
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
      };

      const imageId1 = encodeImageIdInfo(imageInfo1);
      const vp = renderingEngine.getViewport(viewportId);

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
          expect(ellipseAnnotation.metadata.referencedImageId).toBeDefined();

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

      try {
        vp.setStack([imageId1], 0);
        renderingEngine.render();
      } catch (e) {
        done.fail(e);
      }
    });

    // it('Should successfully create a ellipse tool on a canvas with mouse drag in a Volume viewport - 512 x 128', function (done) {
    //   const element =  createViewports(
    //     this.renderingEngine,
    //     ViewportType.ORTHOGRAPHIC,
    //     512,
    //     128
    //   );
    //   this.DOMElements.push(element);

    //   const vp = this.renderingEngine.getViewport(viewportId);

    //   const addEventListenerForAnnotationRendered = () => {
    //     element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
    //       const ellipseAnnotations = annotation.state.getAnnotations(
    //         EllipticalROITool.toolName,
    //         element
    //       );
    //       // Can successfully add Length tool to annotationManager
    //       expect(ellipseAnnotations).toBeDefined();
    //       expect(ellipseAnnotations.length).toBe(1);

    //       const ellipseAnnotation = ellipseAnnotations[0];
    //       expect(ellipseAnnotation.metadata.toolName).toBe(
    //         EllipticalROITool.toolName
    //       );
    //       expect(ellipseAnnotation.invalidated).toBe(false);

    //       const data = ellipseAnnotation.data.cachedStats;
    //       const targets = Array.from(Object.keys(data));
    //       expect(targets.length).toBe(1);

    //       expect(data[targets[0]].mean).toBe(255);
    //       expect(data[targets[0]].stdDev).toBe(0);

    //       annotation.state.removeAnnotation(ellipseAnnotation.annotationUID);
    //       done();
    //     });
    //   };

    //   element.addEventListener(Events.IMAGE_RENDERED, () => {
    //     const index1 = [60, 50, 2];
    //     const index2 = [65, 60, 2];

    //     const { imageData } = vp.getImageData();

    //     const {
    //       pageX: pageX1,
    //       pageY: pageY1,
    //       clientX: clientX1,
    //       clientY: clientY1,
    //       worldCoord: worldCoord1,
    //     } = createNormalizedMouseEvent(imageData, index1, element, vp);
    //     const {
    //       pageX: pageX2,
    //       pageY: pageY2,
    //       clientX: clientX2,
    //       clientY: clientY2,
    //       worldCoord: worldCoord2,
    //     } = createNormalizedMouseEvent(imageData, index2, element, vp);

    //     // Mouse Down
    //     let evt = new MouseEvent('mousedown', {
    //       target: element,
    //       buttons: 1,
    //       clientX: clientX1,
    //       clientY: clientY1,
    //       pageX: pageX1,
    //       pageY: pageY1,
    //     });
    //     element.dispatchEvent(evt);

    //     // Mouse move to put the end somewhere else
    //     evt = new MouseEvent('mousemove', {
    //       target: element,
    //       buttons: 1,
    //       clientX: clientX2,
    //       clientY: clientY2,
    //       pageX: pageX2,
    //       pageY: pageY2,
    //     });
    //     document.dispatchEvent(evt);

    //     // Mouse Up instantly after
    //     evt = new MouseEvent('mouseup');

    //     // addEventListenerForAnnotationRendered();
    //     document.dispatchEvent(evt);
    //   });

    //   try {
    //     volumeLoader
    //       .createAndCacheVolume(volumeId, { imageIds: [] })
    //       .then(() => {
    //         setVolumesForViewports(
    //           this.renderingEngine,
    //           [{ volumeId: volumeId }],
    //           [viewportId]
    //         );
    //         vp.render();
    //       });
    //   } catch (e) {
    //     done.fail(e);
    //   }
    // });
  });

  describe('Should successfully cancel a EllipseTool', () => {
    let testEnv;
    let renderingEngine;
    let stackToolGroup;

    beforeEach(function () {
      testEnv = testUtils.setupTestEnvironment({
        renderingEngineId: renderingEngineId,
        toolGroupIds: ['stack'],
        tools: [EllipticalROITool],
        toolActivations: {
          [EllipticalROITool.toolName]: {
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

    it('Should cancel drawing of a EllipseTool annotation', function (done) {
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
          expect(ellipseAnnotation.metadata.referencedImageId).toBeDefined();

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
        }, 1000);
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
});
