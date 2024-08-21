import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { performMouseDownAndUp } from '../../../utils/test/testUtilsMouseEvents';
import {
  encodeImageIdInfo,
  createViewports,
  setupTestEnvironment,
  cleanupTestEnvironment,
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
  setUseCPURendering,
  resetUseCPURendering,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  ProbeTool,
  ToolGroupManager,
  cancelActiveManipulations,
  annotation,
  Enums: csToolsEnums,
} = csTools3d;

const { Events: csToolsEvents } = csToolsEnums;

const {
  fakeImageLoader,
  fakeMetaDataProvider,
  fakeVolumeLoader,
  createNormalizedMouseEvent,
} = testUtils;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'VIEWPORT';

const volumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 100,
  columns: 100,
  slices: 10,
  xSpacing: 1,
  ySpacing: 1,
});

describe('ProbeTool (CPU):', () => {
  let renderingEngine;
  let stackToolGroup;

  beforeAll(() => {
    setUseCPURendering(true);
  });

  afterAll(() => {
    resetUseCPURendering();
  });

  beforeEach(() => {
    const tools = [ProbeTool];
    const toolConfigurations = {
      [ProbeTool.toolName]: { volumeId: volumeId },
    };
    const toolActivations = {
      [ProbeTool.toolName]: { bindings: [{ mouseButton: 1 }] },
    };

    const setup = setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['stack'],
      tools,
      toolConfigurations,
      toolActivations,
      viewportIds: [viewportId],
    });

    renderingEngine = setup.renderingEngine;
    stackToolGroup = setup.toolGroups['stack'];
  });

  afterEach(() => {
    cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['stack'],
    });
  });

  it('Should successfully click to put a probe tool on a cpu stack viewport - 512 x 128', (done) => {
    const element = createViewports(
      renderingEngine,
      { viewportType: ViewportType.STACK, width: 512, height: 128, viewportId },
      1
    );

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

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const probeAnnotations = annotation.state.getAnnotations(
          ProbeTool.toolName,
          element
        );
        expect(probeAnnotations).toBeDefined();
        expect(probeAnnotations.length).toBe(1);

        const probeAnnotation = probeAnnotations[0];
        expect(probeAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
        expect(probeAnnotation.invalidated).toBe(false);

        const data = probeAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].value).toBe(255);
        annotation.state.removeAnnotation(probeAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 20, 0];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      const mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      });

      const mouseUpEvt = new MouseEvent('mouseup');

      performMouseDownAndUp(
        element,
        mouseDownEvt,
        mouseUpEvt,
        addEventListenerForAnnotationRendered
      );
    });

    try {
      vp.setStack([imageId1], 0);
      vp.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully cancel drawing of a ProbeTool on a cpu stack viewport', (done) => {
    const element = createViewports(
      renderingEngine,
      { viewportType: ViewportType.STACK, width: 256, height: 256, viewportId },
      1
    );

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

    let p2;

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [11, 20, 0];
      const index2 = [40, 40, 0];

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
      p2 = worldCoord2;

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
        const probeAnnotations = annotation.state.getAnnotations(
          ProbeTool.toolName,
          element
        );
        expect(probeAnnotations).toBeDefined();
        expect(probeAnnotations.length).toBe(1);

        const probeAnnotation = probeAnnotations[0];
        expect(probeAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
        expect(probeAnnotation.invalidated).toBe(false);
        expect(probeAnnotation.highlighted).toBe(false);

        const data = probeAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].value).toBe(0);

        const handles = probeAnnotation.data.handles.points;

        expect(handles[0][0]).toEqual(p2[0]);
        expect(handles[0][1]).toEqual(p2[1]);
        expect(handles[0][2]).toEqual(p2[2]);

        annotation.state.removeAnnotation(probeAnnotation.annotationUID);
        done();
      }, 100);
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
