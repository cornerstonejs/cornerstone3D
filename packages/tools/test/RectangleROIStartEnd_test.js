import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { performMouseDownAndUp } from '../../../utils/test/testUtilsMouseEvents';
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
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  RectangleROIStartEndThresholdTool,
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

const volumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 100,
  columns: 100,
  slices: 4,
  xSpacing: 1,
  ySpacing: 1,
});

describe('Rectangle ROI StartEnd Tool:', () => {
  let testEnv;
  let renderingEngine;

  beforeAll(() => {
    cornerstone3D.setUseCPURendering(false);
  });

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['volume'],
      tools: [RectangleROIStartEndThresholdTool],
      toolActivations: {
        [RectangleROIStartEndThresholdTool.toolName]: {
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
      toolGroupIds: ['volume'],
      cleanupDOMElements: true,
    });
  });

  it('Should successfully create a rectangle tool on a canvas with mouse drag in a Volume viewport - 512 x 128', function (done) {
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.ORTHOGRAPHIC,
      width: 512,
      height: 128,
      viewportId: viewportId,
    });

    const vp = renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const rectangleAnnotations = annotation.state.getAnnotations(
          RectangleROIStartEndThresholdTool.toolName,
          element
        );
        // Can successfully add rectangleROI to annotationManager
        expect(rectangleAnnotations).toBeDefined();
        expect(rectangleAnnotations.length).toBe(1);

        const rectangleAnnotation = rectangleAnnotations[0];
        expect(rectangleAnnotation.metadata.toolName).toBe(
          RectangleROIStartEndThresholdTool.toolName
        );
        expect(rectangleAnnotation.invalidated).toBe(false);

        const data = rectangleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(4);
        expect(data.statistics.mean).toBe(85);
        expect(data.statistics.stdDev).toBeCloseTo(120.208);

        annotation.state.removeAnnotation(rectangleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      // Inside the strip which is from 50-75 in slice 2
      // volumeURI_100_100_4_1_1_1_0
      // The strip is from
      const index1 = [50, 10, 2];
      const index2 = [52, 20, 2];

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
});
