import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import _cloneDeep from 'lodash.clonedeep';

const {
  cache,
  RenderingEngine,
  Enums,
  utilities,
  imageLoader,
  eventTarget,
  metaData,
  volumeLoader,
  setVolumesForViewports,
  triggerEvent,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  PlanarFreehandROITool,
  SculptorTool,
  ToolGroupManager,
  Enums: csToolsEnums,
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

const volumeId = `fakeVolumeLoader:volumeURI_100_100_4_1_1_1_0`;

describe('Sculptor Tool: ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  describe('Cornerstone Tools: ', () => {
    beforeEach(function () {
      csTools3d.init();
      csTools3d.addTool(SculptorTool);
      csTools3d.addTool(PlanarFreehandROITool);
      cache.purgeCache();
      this.DOMElements = [];

      this.stackToolGroup = ToolGroupManager.createToolGroup('stack');
      this.stackToolGroup.addTool(SculptorTool.toolName, {
        configuration: { volumeId: volumeId },
      });
      this.stackToolGroup.addTool(PlanarFreehandROITool.toolName, {
        configuration: { volumeId: volumeId },
      });
      this.stackToolGroup.setToolActive(SculptorTool.toolName, {
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

    it('Should successfully add a freeHand tool on a canvas and sculpt it with mouse drag - 512 x 128', function (done) {
      let initialPoints;
      const freehandAnnotation = {
        highlighted: true,
        invalidated: true,
        metadata: {
          viewPlaneNormal: [0, 0, -1],
          viewUp: [0, -1, 0],
          referencedImageId: 'fakeImageLoader:imageURI_64_64_10_5_1_1_0',
          toolName: 'PlanarFreehandROI',
        },
        data: {
          handles: {
            points: [
              [10, 10, 0],
              [11, 12, 0],
            ],
            activeHandleIndex: null,
            textBox: {
              hasMoved: false,
              worldPosition: [0, 0, 0],
              worldBoundingBox: {
                topLeft: [0, 0, 0],
                topRight: [0, 0, 0],
                bottomLeft: [0, 0, 0],
                bottomRight: [0, 0, 0],
              },
            },
          },
          contour: {
            closed: false,
            polyline: [
              [10, 10, 0],
              [10, 10.2, 0],
              [10, 10.4, 0],
              [10, 10.6, 0],
              [10, 10.8, 0],
              [10, 11, 0],
              [10.2, 11.2, 0],
              [10.4, 11.4, 0],
              [10.6, 11.6, 0],
              [10.8, 11.8, 0],
              [11, 12, 0],
            ],
          },
          label: '',
          cachedStats: {},
        },
        annotationUID: 'dfb767d6-1302-4535-a0e8-d80fb3d62c2f',
        isLocked: false,
        isVisible: true,
      };
      const element = createViewport(
        this.renderingEngine,
        ViewportType.STACK,
        512,
        128
      );
      this.DOMElements.push(element);

      const imageId1 = 'fakeImageLoader:imageURI_64_64_10_5_1_1_0';
      const vp = this.renderingEngine.getViewport(viewportId);

      const addEventListenerForAnnotationModified = () => {
        element.addEventListener(csToolsEvents.ANNOTATION_MODIFIED, () => {
          const freehandRoiAnnotations = annotation.state.getAnnotations(
            PlanarFreehandROITool.toolName,
            element
          );

          expect(freehandRoiAnnotations).toBeDefined();
          expect(freehandRoiAnnotations.length).toBe(1);

          const freehandRoiAnnotation = freehandRoiAnnotations[0];
          const pointsAfterSculpt = freehandRoiAnnotation.data.contour.polyline;
          expect(freehandRoiAnnotation.data.contour.polyline).toBeDefined();
          expect(pointsAfterSculpt).not.toEqual(initialPoints);
          annotation.state.removeAnnotation(
            freehandRoiAnnotation.annotationUID
          );
          done();
        });
      };

      const addEventListenerForAnnotationAdded = () => {
        element.addEventListener(csToolsEvents.ANNOTATION_ADDED, () => {
          const freehandRoiAnnotations = annotation.state.getAnnotations(
            PlanarFreehandROITool.toolName,
            element
          );

          expect(freehandRoiAnnotations).toBeDefined();
          expect(freehandRoiAnnotations.length).toBe(1);

          const freehandRoiAnnotation = freehandRoiAnnotations[0];
          expect(freehandRoiAnnotation.data.contour.polyline).toBeDefined();
          expect(freehandRoiAnnotation.metadata.toolName).toBe(
            PlanarFreehandROITool.toolName
          );
          initialPoints = _cloneDeep(
            freehandRoiAnnotation.data.contour.polyline
          );
        });
      };

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        addEventListenerForAnnotationAdded();
        annotation.state.addAnnotation(freehandAnnotation, element);
        triggerEvent(element, csToolsEnums.Events.ANNOTATION_ADDED);

        const index1 = [10, 10, 0];
        const index2 = [11, 12, 0];

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

        addEventListenerForAnnotationModified();
        document.dispatchEvent(evt);

        triggerEvent(
          element,
          csToolsEnums.Events.ANNOTATION_MODIFIED,
          evt.detail
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

    it('Should successfully add a freehandROI tool on a canvas in a Volume viewport and sculpt it on mouse drag - 512 x 128', function (done) {
      let initialPoints;
      const freehandAnnotation = {
        highlighted: true,
        invalidated: true,
        metadata: {
          viewPlaneNormal: [0, 0, -1],
          viewUp: [0, -1, 0],
          FrameOfReferenceUID: 'Volume_Frame_Of_Reference',
          toolName: 'PlanarFreehandROI',
        },
        data: {
          handles: {
            points: [
              [50, 10, 2],
              [60, 20.2],
            ],
            activeHandleIndex: null,
            textBox: {
              hasMoved: false,
              worldPosition: [0, 0, 0],
              worldBoundingBox: {
                topLeft: [0, 0, 0],
                topRight: [0, 0, 0],
                bottomLeft: [0, 0, 0],
                bottomRight: [0, 0, 0],
              },
            },
          },
          contour: {
            closed: false,
            polyline: [
              [50, 10, 2],
              [51, 11, 2],
              [52, 12, 2],
              [53, 13, 2],
              [54, 14, 2],
              [55, 15, 2],
              [56, 16, 2],
              [57, 17, 2],
              [58, 18, 2],
              [59, 19, 2],
              [60, 20, 2],
            ],
          },
          label: '',
          cachedStats: {},
        },
        annotationUID: '0ffb55d1-845b-4dfe-85ff-26f435ffeb0a',
        isLocked: false,
        isVisible: true,
      };
      const element = createViewport(
        this.renderingEngine,
        ViewportType.ORTHOGRAPHIC,
        512,
        128
      );
      this.DOMElements.push(element);

      const vp = this.renderingEngine.getViewport(viewportId);

      const addEventListenerForAnnotationAdded = () => {
        element.addEventListener(csToolsEvents.ANNOTATION_ADDED, () => {
          const freehandRoiAnnotations = annotation.state.getAnnotations(
            PlanarFreehandROITool.toolName,
            element
          );
          //successfully added freehandROI annotation to annotationManager
          expect(freehandRoiAnnotations).toBeDefined();
          expect(freehandRoiAnnotations.length).toBe(1);
          const freehandRoiAnnotation = freehandRoiAnnotations[0];
          expect(freehandRoiAnnotation.data.contour.polyline).toBeDefined();
          expect(freehandRoiAnnotation.metadata.toolName).toBe(
            PlanarFreehandROITool.toolName
          );
          initialPoints = _cloneDeep(
            freehandRoiAnnotation.data.contour.polyline
          );
        });
      };

      const addEventListenerForAnnotationModified = () => {
        element.addEventListener(csToolsEvents.ANNOTATION_MODIFIED, () => {
          const freehandRoiAnnotations = annotation.state.getAnnotations(
            PlanarFreehandROITool.toolName,
            element
          );

          expect(freehandRoiAnnotations).toBeDefined();
          expect(freehandRoiAnnotations.length).toBe(1);

          const freehandRoiAnnotation = freehandRoiAnnotations[0];
          const pointsAfterSculpt = freehandRoiAnnotation.data.contour.polyline;
          expect(freehandRoiAnnotation.data.contour.polyline).toBeDefined();
          expect(pointsAfterSculpt).not.toEqual(initialPoints);
          annotation.state.removeAnnotation(
            freehandRoiAnnotation.annotationUID
          );
          done();
        });
      };

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        addEventListenerForAnnotationAdded();
        annotation.state.addAnnotation(freehandAnnotation, element);
        triggerEvent(element, csToolsEnums.Events.ANNOTATION_ADDED);

        const index1 = [55, 10, 2];
        const index2 = [65, 20, 2];

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

        addEventListenerForAnnotationModified();
        document.dispatchEvent(evt);

        triggerEvent(
          element,
          csToolsEnums.Events.ANNOTATION_MODIFIED,
          evt.detail
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
  });
});
