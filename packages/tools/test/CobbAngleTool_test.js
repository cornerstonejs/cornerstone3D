import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { performMouseDownAndUp } from '../../../utils/test/testUtilsMouseEvents';

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

describe('CobbAngleTool:', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Cornerstone Tools: -- CobbAngle ', () => {
    beforeEach(function () {
      csTools3d.init();
      csTools3d.addTool(csTools3d.CobbAngleTool);
      cache.purgeCache();
      this.DOMElements = [];

      this.stackToolGroup = ToolGroupManager.createToolGroup('stack');
      this.stackToolGroup.addTool(CobbAngleTool.toolName, {
        configuration: { volumeId: volumeId },
      });
      this.stackToolGroup.setToolActive(CobbAngleTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });

      this.renderingEngine = new RenderingEngine(renderingEngineId);
      imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
      volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
    });

    afterEach(function () {
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

    it('Should successfully create a Cobb angle tool with angle less than 90 degrees on a canvas with mouse drag - 512 x 128', function (done) {
      const element = createViewport(
        this.renderingEngine,
        ViewportType.STACK,
        512,
        128
      );

      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
          const cobbAngleAnnotations = annotation.state.getAnnotations(
            CobbAngleTool.toolName,
            element
          );

          // Can successfully add Cobb Angle tool to annotationManager
          expect(cobbAngleAnnotations).toBeDefined();
          expect(cobbAngleAnnotations.length).toBe(1);

          const cobbAngleAnnotation = cobbAngleAnnotations[0];
          expect(cobbAngleAnnotation.metadata.referencedImageId).toBe(imageId1);
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
        } = createNormalizedMouseEvent(imageData, index1, element, vp);

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
        } = createNormalizedMouseEvent(imageData, index2, element, vp);

        const {
          pageX: pageX3,
          pageY: pageY3,
          clientX: clientX3,
          clientY: clientY3,
        } = createNormalizedMouseEvent(imageData, index3, element, vp);

        const {
          pageX: pageX4,
          pageY: pageY4,
          clientX: clientX4,
          clientY: clientY4,
        } = createNormalizedMouseEvent(imageData, index4, element, vp);

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

      this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

      try {
        vp.setStack([imageId1], 0);
        this.renderingEngine.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should successfully create a Cobb Angle tool with angle greater than 90 degrees on a canvas with mouse clicks in a Volume viewport - 512 x 128', function (done) {
      const element = createViewport(
        this.renderingEngine,
        ViewportType.ORTHOGRAPHIC,
        512,
        128
      );
      this.DOMElements.push(element);

      const vp = this.renderingEngine.getViewport(viewportId);

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
          const cobbAngleAnnotations = annotation.state.getAnnotations(
            CobbAngleTool.toolName,
            element
          );
          // Can successfully add Cobb Angle tool to annotationManager
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
        } = createNormalizedMouseEvent(imageData, index1, element, vp);

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
        } = createNormalizedMouseEvent(imageData, index2, element, vp);

        const {
          pageX: pageX3,
          pageY: pageY3,
          clientX: clientX3,
          clientY: clientY3,
        } = createNormalizedMouseEvent(imageData, index3, element, vp);

        const {
          pageX: pageX4,
          pageY: pageY4,
          clientX: clientX4,
          clientY: clientY4,
        } = createNormalizedMouseEvent(imageData, index4, element, vp);

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

      this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesForViewports(
              this.renderingEngine,
              [{ volumeId: volumeId }],
              [viewportId]
            );
            vp.render();
          });
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should successfully create a Cobb Angle tool with combined clicks and drag and modify its handle', function (done) {
      const element = createViewport(
        this.renderingEngine,
        ViewportType.STACK,
        256,
        256
      );
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
          const cobbAngleAnnotations = annotation.state.getAnnotations(
            CobbAngleTool.toolName,
            element
          );
          // Can successfully add Cobb Angle tool to annotationManager
          expect(cobbAngleAnnotations).toBeDefined();
          expect(cobbAngleAnnotations.length).toBe(1);

          const cobbAngleAnnotation = cobbAngleAnnotations[0];
          expect(cobbAngleAnnotation.metadata.referencedImageId).toBe(imageId1);
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
        } = createNormalizedMouseEvent(imageData, index1, element, vp);

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
        } = createNormalizedMouseEvent(imageData, index2, element, vp);

        const {
          pageX: pageX3,
          pageY: pageY3,
          clientX: clientX3,
          clientY: clientY3,
        } = createNormalizedMouseEvent(imageData, index3, element, vp);

        const {
          pageX: pageX4,
          pageY: pageY4,
          clientX: clientX4,
          clientY: clientY4,
        } = createNormalizedMouseEvent(imageData, index4, element, vp);

        const {
          pageX: pageX5,
          pageY: pageY5,
          clientX: clientX5,
          clientY: clientY5,
        } = createNormalizedMouseEvent(imageData, index5, element, vp);

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

      this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

      try {
        vp.setStack([imageId1], 0);
        this.renderingEngine.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should successfully create a Cobb angle tool with combined clicks and drags and select but not move it', function (done) {
      const element = createViewport(
        this.renderingEngine,
        ViewportType.STACK,
        256,
        256
      );
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
          const cobbAngleAnnotations = annotation.state.getAnnotations(
            CobbAngleTool.toolName,
            element
          );
          // Can successfully add Cobb Angle tool to annotationManager
          expect(cobbAngleAnnotations).toBeDefined();
          expect(cobbAngleAnnotations.length).toBe(1);

          const cobbAngleAnnotation = cobbAngleAnnotations[0];
          expect(cobbAngleAnnotation.metadata.referencedImageId).toBe(imageId1);
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
        } = createNormalizedMouseEvent(imageData, index1, element, vp);

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
        } = createNormalizedMouseEvent(imageData, index2, element, vp);

        const {
          pageX: pageX3,
          pageY: pageY3,
          clientX: clientX3,
          clientY: clientY3,
        } = createNormalizedMouseEvent(imageData, index3, element, vp);

        const {
          pageX: pageX4,
          pageY: pageY4,
          clientX: clientX4,
          clientY: clientY4,
        } = createNormalizedMouseEvent(imageData, index4, element, vp);

        const {
          pageX: pageX5,
          pageY: pageY5,
          clientX: clientX5,
          clientY: clientY5,
        } = createNormalizedMouseEvent(imageData, index5, element, vp);

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

      this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

      try {
        vp.setStack([imageId1], 0);
        this.renderingEngine.render();
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should successfully create a Cobb Angle tool and select AND move it', function (done) {
      const element = createViewport(
        this.renderingEngine,
        ViewportType.STACK,
        256,
        256
      );
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      let p1, p2, p3, p4, p5, p6;

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
          const cobbAngleAnnotations = annotation.state.getAnnotations(
            CobbAngleTool.toolName,
            element
          );
          // Can successfully add Cobb Angle tool to annotationManager
          expect(cobbAngleAnnotations).toBeDefined();
          expect(cobbAngleAnnotations.length).toBe(1);

          const cobbAngleAnnotation = cobbAngleAnnotations[0];
          expect(cobbAngleAnnotation.metadata.referencedImageId).toBe(imageId1);
          expect(cobbAngleAnnotation.metadata.toolName).toBe(
            CobbAngleTool.toolName
          );
          expect(cobbAngleAnnotation.invalidated).toBe(false);
          expect(cobbAngleAnnotation.highlighted).toBe(true);

          const data = cobbAngleAnnotation.data.cachedStats;
          const targets = Array.from(Object.keys(data));
          expect(targets.length).toBe(1);

          expect(Math.round(data[targets[0]].angle)).toBe(0);

          const handles = cobbAngleAnnotation.data.handles.points;

          const preMoveFirstHandleFirstSeg = p1;
          const preMoveSecondHandleFirstSeg = p2;
          const preMoveCenter = p5;

          const centerToHandle1Seg1 = [
            preMoveCenter[0] - preMoveFirstHandleFirstSeg[0],
            preMoveCenter[1] - preMoveFirstHandleFirstSeg[1],
            preMoveCenter[2] - preMoveFirstHandleFirstSeg[2],
          ];

          const centerToHandle2Seg1 = [
            preMoveCenter[0] - preMoveSecondHandleFirstSeg[0],
            preMoveCenter[1] - preMoveSecondHandleFirstSeg[1],
            preMoveCenter[2] - preMoveSecondHandleFirstSeg[2],
          ];

          const afterMoveCenter = p6;

          const afterMoveFirstHandleSeg1 = [
            afterMoveCenter[0] - centerToHandle1Seg1[0],
            afterMoveCenter[1] - centerToHandle1Seg1[1],
            afterMoveCenter[2] - centerToHandle1Seg1[2],
          ];

          const afterMoveSecondHandleSeg1 = [
            afterMoveCenter[0] - centerToHandle2Seg1[0],
            afterMoveCenter[1] - centerToHandle2Seg1[1],
            afterMoveCenter[2] - centerToHandle2Seg1[2],
          ];

          // First handles should not have been moved
          expect(handles[0]).toEqual(afterMoveFirstHandleSeg1);
          expect(handles[1]).toEqual(afterMoveSecondHandleSeg1);

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

        // where to move the middle to
        const index6 = [100, 30, 0];

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

        const {
          pageX: pageX5,
          pageY: pageY5,
          clientX: clientX5,
          clientY: clientY5,
          worldCoord: worldCoord5,
        } = createNormalizedMouseEvent(imageData, index5, element, vp);
        p5 = worldCoord5;

        const {
          pageX: pageX6,
          pageY: pageY6,
          clientX: clientX6,
          clientY: clientY6,
          worldCoord: worldCoord6,
        } = createNormalizedMouseEvent(imageData, index6, element, vp);
        p6 = worldCoord6;

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

        // Drag the middle of the tool
        evt = new MouseEvent('mousedown', {
          target: element,
          buttons: 1,
          clientX: clientX5,
          clientY: clientY5,
          pageX: pageX5,
          pageY: pageY5,
        });
        element.dispatchEvent(evt);

        // Move the middle of the tool to point6
        evt = new MouseEvent('mousemove', {
          target: element,
          buttons: 1,
          clientX: clientX6,
          clientY: clientY6,
          pageX: pageX6,
          pageY: pageY6,
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

    it('Should successfully create a Cobb Angle tool on a canvas and remove it after', function (done) {
      const element = createViewport(
        this.renderingEngine,
        ViewportType.STACK,
        512,
        128
      );

      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      const addEventListenerForAnnotationRendered = () => {
        element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
          const cobbAngleAnnotations = annotation.state.getAnnotations(
            CobbAngleTool.toolName,
            element
          );
          // Can successfully add Cobb Angle tool to annotationManager
          expect(cobbAngleAnnotations).toBeDefined();
          expect(cobbAngleAnnotations.length).toBe(1);

          const cobbAngleAnnotation = cobbAngleAnnotations[0];
          expect(cobbAngleAnnotation.metadata.referencedImageId).toBe(imageId1);
          expect(cobbAngleAnnotation.metadata.toolName).toBe(
            CobbAngleTool.toolName
          );
          expect(cobbAngleAnnotation.invalidated).toBe(false);

          const data = cobbAngleAnnotation.data.cachedStats;
          const targets = Array.from(Object.keys(data));
          expect(targets.length).toBe(1);

          expect(Math.round(data[targets[0]].angle)).toBe(90);
          annotation.state.removeAnnotation(cobbAngleAnnotation.annotationUID);

          const annotationsAfterRemove = annotation.state.getAnnotations(
            CobbAngleTool.toolName,
            element
          );

          expect(annotationsAfterRemove).toBeDefined();
          expect(annotationsAfterRemove.length).toBe(0);

          done();
        });
      };

      element.addEventListener(Events.IMAGE_RENDERED, async () => {
        const index1 = [32, 32, 0];
        const index2 = [32, 88, 0];
        const index3 = [167, 9, 0];
        const index4 = [123, 9, 0];

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

        const {
          pageX: pageX3,
          pageY: pageY3,
          clientX: clientX3,
          clientY: clientY3,
        } = createNormalizedMouseEvent(imageData, index3, element, vp);

        const {
          pageX: pageX4,
          pageY: pageY4,
          clientX: clientX4,
          clientY: clientY4,
        } = createNormalizedMouseEvent(imageData, index4, element, vp);

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

      this.stackToolGroup.addViewport(vp.id, this.renderingEngine.id);

      try {
        vp.setStack([imageId1], 0);
        this.renderingEngine.render();
      } catch (e) {
        done.fail(e);
      }
    });
  });

  describe('Should successfully cancel a CobbAngleTool', () => {
    beforeEach(function () {
      csTools3d.init();
      csTools3d.addTool(CobbAngleTool);
      cache.purgeCache();
      this.DOMElements = [];

      this.stackToolGroup = ToolGroupManager.createToolGroup('stack');
      this.stackToolGroup.addTool(CobbAngleTool.toolName, {
        configuration: { volumeId: volumeId },
      });
      this.stackToolGroup.setToolActive(CobbAngleTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });

      this.renderingEngine = new RenderingEngine(renderingEngineId);
      imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
      volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
      metaData.addProvider(fakeMetaDataProvider, 10000);
    });

    afterEach(function () {
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

    it('Should cancel drawing of a CobbAngleTool annotation', function (done) {
      const element = createViewport(
        this.renderingEngine,
        ViewportType.STACK,
        512,
        128
      );
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

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
        } = createNormalizedMouseEvent(imageData, index1, element, vp);

        const {
          pageX: pageX2,
          pageY: pageY2,
          clientX: clientX2,
          clientY: clientY2,
        } = createNormalizedMouseEvent(imageData, index2, element, vp);

        const {
          pageX: pageX3,
          pageY: pageY3,
          clientX: clientX3,
          clientY: clientY3,
        } = createNormalizedMouseEvent(imageData, index3, element, vp);

        const {
          pageX: pageX4,
          pageY: pageY4,
          clientX: clientX4,
          clientY: clientY4,
        } = createNormalizedMouseEvent(imageData, index4, element, vp);

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
          const cobbAngleAnnotations = annotation.state.getAnnotations(
            CobbAngleTool.toolName,
            element
          );
          // Can successfully add Cobb Angle tool to annotationManager
          expect(cobbAngleAnnotations).toBeDefined();
          expect(cobbAngleAnnotations.length).toBe(1);

          const cobbAngleAnnotation = cobbAngleAnnotations[0];
          expect(cobbAngleAnnotation.metadata.referencedImageId).toBe(imageId1);
          expect(cobbAngleAnnotation.metadata.toolName).toBe(
            CobbAngleTool.toolName
          );
          expect(cobbAngleAnnotation.invalidated).toBe(false);
          expect(cobbAngleAnnotation.data.handles.activeHandleIndex).toBe(null);
          expect(cobbAngleAnnotation.highlighted).toBe(false);

          const data = cobbAngleAnnotation.data.cachedStats;
          const targets = Array.from(Object.keys(data));
          expect(targets.length).toBe(1);

          expect(Math.round(data[targets[0]].angle)).toBe(30);
          annotation.state.removeAnnotation(cobbAngleAnnotation.annotationUID);
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
});
