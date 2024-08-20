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

const volumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 100,
  columns: 100,
  slices: 4,
  xSpacing: 1,
  ySpacing: 1,
});

describe('Sculptor Tool:', () => {
  let testEnv;
  let renderingEngine;
  let stackToolGroup;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['stack'],
      tools: [SculptorTool, PlanarFreehandROITool],
      toolActivations: {
        [SculptorTool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
      viewportIds: [viewportId],
    });

    renderingEngine = testEnv.renderingEngine;
    stackToolGroup = testEnv.toolGroups.stack;

    stackToolGroup.addTool(PlanarFreehandROITool.toolName, {
      configuration: { volumeId: volumeId },
    });
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['stack'],
      cleanupDOMElements: true,
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
        referencedImageId: encodeImageIdInfo({
          loader: 'fakeImageLoader',
          name: 'imageURI',
          rows: 64,
          columns: 64,
          barStart: 10,
          barWidth: 5,
          xSpacing: 1,
          ySpacing: 1,
          sliceIndex: 0,
        }),
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

    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      width: 512,
      height: 128,
      viewportId: viewportId,
    });

    const imageId1 = encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    });
    const vp = renderingEngine.getViewport(viewportId);

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
        annotation.state.removeAnnotation(freehandRoiAnnotation.annotationUID);
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
        initialPoints = structuredClone(
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

    stackToolGroup.addViewport(vp.id, renderingEngine.id);

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });
});
