import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

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
const { registerVolumeLoader, createAndCacheVolume } = volumeLoader;

const {
  CircleROIStartEndThresholdTool,
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
  zSpacing: 1,
});

describe('Circle Start End Tool: ', () => {
  let renderingEngine;
  let toolGroup;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['volume'],
      viewportIds: [viewportId],
      tools: [CircleROIStartEndThresholdTool],
      toolConfigurations: {
        [CircleROIStartEndThresholdTool.toolName]: {
          configuration: { volumeId: volumeId },
        },
      },
      toolActivations: {
        [CircleROIStartEndThresholdTool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
    });
    renderingEngine = testEnv.renderingEngine;
    toolGroup = testEnv.toolGroups['volume'];
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['volume'],
      cleanupDOMElements: true,
    });
  });

  it('Should successfully create a circle start end tool on a canvas with mouse drag - 512 x 128', function (done) {
    const element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.ORTHOGRAPHIC,
      width: 512,
      height: 128,
    });

    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    const vp = renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const circleAnnotations = annotation.state.getAnnotations(
          CircleROIStartEndThresholdTool.toolName,
          element
        );
        expect(circleAnnotations).toBeDefined();
        expect(circleAnnotations.length).toBe(1);

        const circleAnnotation = circleAnnotations[0];
        //expect(circleAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(circleAnnotation.metadata.toolName).toBe(
          CircleROIStartEndThresholdTool.toolName
        );
        expect(circleAnnotation.invalidated).toBe(false);

        const data = circleAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(3);
        expect(data.pointsInVolume).toBeInstanceOf(Array);

        // the rectangle is drawn on the strip
        expect(data.statistics.mean).toBeCloseTo(28.33);

        annotation.state.removeAnnotation(circleAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      // Since circle draws from center to out, we are picking a very center
      // point in the image  (strip is 255 from 10-15 in X and from 0-64 in Y)
      const index1 = [12, 30, 0];
      const index2 = [14, 30, 0];

      if (!vp.getImageData()) {
        return;
      }

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = testUtils.createNormalizedMouseEvent(imageData, index1, element, vp);

      const {
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
        worldCoord: worldCoord2,
      } = testUtils.createNormalizedMouseEvent(imageData, index2, element, vp);

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
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
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
