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
  eventTarget,
  utilities,
  imageLoader,
  metaData,
  volumeLoader,
  setUseCPURendering,
  resetUseCPURendering,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  LengthTool,
  ToolGroupManager,
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

function calculateLength(pos1, pos2) {
  const dx = pos1[0] - pos2[0];
  const dy = pos1[1] - pos2[1];
  const dz = pos1[2] - pos2[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
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

describe('Length Tool (CPU):', () => {
  let renderingEngine;
  let stackToolGroup;
  let element;

  beforeAll(() => {
    setUseCPURendering(true);
  });

  afterAll(() => {
    resetUseCPURendering();
  });

  beforeEach(() => {
    const tools = [LengthTool];
    const toolConfigurations = {
      [LengthTool.toolName]: { volumeId: volumeId },
    };
    const toolActivations = {
      [LengthTool.toolName]: { bindings: [{ mouseButton: 1 }] },
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

    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });

  it('Should successfully create a length tool on a cpu stack viewport with mouse drag - 512 x 128', (done) => {
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

    let p1, p2;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const lengthAnnotations = annotation.state.getAnnotations(
          LengthTool.toolName,
          element
        );
        expect(lengthAnnotations).toBeDefined();
        expect(lengthAnnotations.length).toBe(1);

        const lengthAnnotation = lengthAnnotations[0];
        expect(lengthAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(lengthAnnotation.metadata.toolName).toBe(LengthTool.toolName);
        expect(lengthAnnotation.invalidated).toBe(false);

        const data = lengthAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].length).toBe(calculateLength(p1, p2));
        annotation.state.removeAnnotation(lengthAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [30, 30, 0];
      const index2 = [60, 60, 0];

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

  it('Should successfully create a length tool on a cpu stack viewport and select AND move it', (done) => {
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

    let p1, p2, p3, p4;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const lengthAnnotations = annotation.state.getAnnotations(
          LengthTool.toolName,
          element
        );
        expect(lengthAnnotations).toBeDefined();
        expect(lengthAnnotations.length).toBe(1);

        const lengthAnnotation = lengthAnnotations[0];
        expect(lengthAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(lengthAnnotation.metadata.toolName).toBe(LengthTool.toolName);
        expect(lengthAnnotation.invalidated).toBe(false);

        const data = lengthAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        expect(data[targets[0]].length).toBeCloseTo(calculateLength(p1, p2), 6);

        const handles = lengthAnnotation.data.handles.points;

        const preMoveFirstHandle = p1;
        const preMoveSecondHandle = p2;
        const preMoveCenter = p3;

        const centerToHandle1 = [
          preMoveCenter[0] - preMoveFirstHandle[0],
          preMoveCenter[1] - preMoveFirstHandle[1],
          preMoveCenter[2] - preMoveFirstHandle[2],
        ];

        const centerToHandle2 = [
          preMoveCenter[0] - preMoveSecondHandle[0],
          preMoveCenter[1] - preMoveSecondHandle[1],
          preMoveCenter[2] - preMoveSecondHandle[2],
        ];

        const afterMoveCenter = p4;

        const afterMoveFirstHandle = [
          afterMoveCenter[0] - centerToHandle1[0],
          afterMoveCenter[1] - centerToHandle1[1],
          afterMoveCenter[2] - centerToHandle1[2],
        ];

        const afterMoveSecondHandle = [
          afterMoveCenter[0] - centerToHandle2[0],
          afterMoveCenter[1] - centerToHandle2[1],
          afterMoveCenter[2] - centerToHandle2[2],
        ];

        expect(handles[0]).toEqual(afterMoveFirstHandle);
        expect(handles[1]).toEqual(afterMoveSecondHandle);

        annotation.state.removeAnnotation(lengthAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [20, 20, 0];
      const index2 = [20, 30, 0];
      const index3 = [20, 25, 0];
      const index4 = [40, 40, 0];

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

      evt = new MouseEvent('mouseup');
      document.dispatchEvent(evt);

      evt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX3,
        clientY: clientY3,
        pageX: pageX3,
        pageY: pageY3,
      });
      element.dispatchEvent(evt);

      evt = new MouseEvent('mousemove', {
        target: element,
        buttons: 1,
        clientX: clientX4,
        clientY: clientY4,
        pageX: pageX4,
        pageY: pageY4,
      });
      document.dispatchEvent(evt);

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
});
