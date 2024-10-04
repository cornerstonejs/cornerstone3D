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
  metaData,
  volumeLoader,
  setVolumesForViewports,
  getEnabledElement,
} = cornerstone3D;

const { Events, ViewportType } = Enums;

const {
  ProbeTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  cancelActiveManipulations,
  annotation,
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

describe('Probe Tool:', () => {
  let testEnv;
  let renderingEngine;
  let stackToolGroup;

  beforeEach(function () {
    testEnv = testUtils.setupTestEnvironment({
      renderingEngineId: renderingEngineId,
      toolGroupIds: ['stack'],
      tools: [ProbeTool],
      toolActivations: {
        [ProbeTool.toolName]: {
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

  it('Should successfully click to put a probe tool on a canvas - 512 x 128', function (done) {
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

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        // Can successfully add probe tool to annotationManager
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

        // The world coordinate is on the white bar so value is 255
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

      // Mouse Down
      const mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      });
      // Mouse Up instantly after
      const mouseUpEvt = new MouseEvent('mouseup');

      performMouseDownAndUp(
        element,
        mouseDownEvt,
        mouseUpEvt,
        // Since there is tool rendering happening for any mouse event
        // we just attach a listener before the last one -> mouse up
        addEventListenerForAnnotationRendered
      );
    });

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully click to put two probe tools on a canvas - 256 x 256', function (done) {
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      width: 256,
      height: 256,
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

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        // Can successfully add probe tool to annotationManager
        const probeAnnotations = annotation.state.getAnnotations(
          ProbeTool.toolName,
          element
        );
        expect(probeAnnotations).toBeDefined();
        expect(probeAnnotations.length).toBe(2);

        const firstProbeAnnotation = probeAnnotations[0];
        expect(firstProbeAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(firstProbeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
        expect(firstProbeAnnotation.invalidated).toBe(false);

        let data = firstProbeAnnotation.data.cachedStats;
        let targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(255);

        // Second click
        const secondProbeAnnotation = probeAnnotations[1];
        expect(secondProbeAnnotation.metadata.toolName).toBe(
          ProbeTool.toolName
        );
        expect(secondProbeAnnotation.invalidated).toBe(false);

        data = secondProbeAnnotation.data.cachedStats;
        targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(0);

        //
        annotation.state.removeAnnotation(firstProbeAnnotation.annotationUID);
        annotation.state.removeAnnotation(secondProbeAnnotation.annotationUID);

        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, async () => {
      const index1 = [11, 20, 0]; // 255
      const index2 = [20, 20, 0]; // 0

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
      const mouseDownEvt1 = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      });

      // Mouse Up instantly after
      const mouseUpEvt1 = new MouseEvent('mouseup');

      await performMouseDownAndUp(element, mouseDownEvt1, mouseUpEvt1);

      // Mouse Down
      const mouseDownEvt2 = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        pageX: pageX2,
        pageY: pageY2,
        clientX: clientX2,
        clientY: clientY2,
      });

      // Mouse Up instantly after
      const mouseUpEvt2 = new MouseEvent('mouseup');

      performMouseDownAndUp(
        element,
        mouseDownEvt2,
        mouseUpEvt2,
        addEventListenerForAnnotationRendered
      );
    });

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully click to put a probe tool on a canvas - 256 x 512', function (done) {
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      width: 256,
      height: 512,
      viewportId: viewportId,
    });

    const imageInfo1 = {
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 256,
      columns: 256,
      barStart: 100,
      barWidth: 100,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    };

    const imageId1 = encodeImageIdInfo(imageInfo1);
    const vp = renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        // Can successfully add probe tool to annotationManager
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

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(255);

        annotation.state.removeAnnotation(probeAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [150, 100, 0]; // 255

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      // Mouse Down
      const mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      });

      // Mouse Up instantly after
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
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully click to put a probe tool on a canvas - 256 x 512', function (done) {
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      width: 256,
      height: 512,
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

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        // Can successfully add probe tool to annotationManager
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

        // The world coordinate is on the white bar so value is 255
        expect(data[targets[0]].value).toBe(0);

        annotation.state.removeAnnotation(probeAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, () => {
      const index1 = [35, 35, 0]; // 0

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      // Mouse Down
      const mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
      });

      // Mouse Up instantly after
      const mouseUpEvt = new MouseEvent('mouseup');

      performMouseDownAndUp(
        element,
        mouseDownEvt,
        mouseUpEvt,
        addEventListenerForAnnotationRendered
      );
      element.dispatchEvent(mouseDownEvt);
      document.dispatchEvent(mouseDownEvt);
    });

    try {
      vp.setStack([imageId1], 0);
      renderingEngine.render();
    } catch (e) {
      done.fail(e);
    }
  });

  it('Should successfully create a prob tool on a canvas with mouse drag in a Volume viewport - 512 x 128', function (done) {
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.ORTHOGRAPHIC,
      width: 512,
      height: 128,
      viewportId: viewportId,
    });

    const vp = renderingEngine.getViewport(viewportId);

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const probeAnnotations = annotation.state.getAnnotations(
          ProbeTool.toolName,
          element
        );
        // Can successfully add Length tool to annotationManager
        expect(probeAnnotations).toBeDefined();
        expect(probeAnnotations.length).toBe(1);

        const probeAnnotation = probeAnnotations[0];
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
      const index1 = [50, 50, 4];

      const { imageData } = vp.getImageData();

      const {
        pageX: pageX1,
        pageY: pageY1,
        clientX: clientX1,
        clientY: clientY1,
        worldCoord: worldCoord1,
      } = createNormalizedMouseEvent(imageData, index1, element, vp);

      // Mouse Down
      const mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });

      // Mouse Up instantly after
      const mouseUpEvt = new MouseEvent('mouseup');

      performMouseDownAndUp(
        element,
        mouseDownEvt,
        mouseUpEvt,
        addEventListenerForAnnotationRendered
      );
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

  it('Should successfully create a Probe tool and select AND move it', function (done) {
    const element = createViewports(renderingEngine, {
      viewportType: ViewportType.STACK,
      width: 256,
      height: 256,
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

    let p2;

    const addEventListenerForAnnotationRendered = () => {
      element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, () => {
        const probeAnnotations = annotation.state.getAnnotations(
          ProbeTool.toolName,
          element
        );
        // Can successfully add Length tool to annotationManager
        expect(probeAnnotations).toBeDefined();
        expect(probeAnnotations.length).toBe(1);

        const probeAnnotation = probeAnnotations[0];
        expect(probeAnnotation.metadata.referencedImageId).toBe(imageId1);
        expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
        expect(probeAnnotation.invalidated).toBe(false);

        const data = probeAnnotation.data.cachedStats;
        const targets = Array.from(Object.keys(data));
        expect(targets.length).toBe(1);

        // We expect the probeTool which was original on 255 strip should be 0 now
        expect(data[targets[0]].value).toBe(0);

        const handles = probeAnnotation.data.handles.points;

        expect(handles[0]).toEqual(p2);

        annotation.state.removeAnnotation(probeAnnotation.annotationUID);
        done();
      });
    };

    element.addEventListener(Events.IMAGE_RENDERED, async () => {
      const index1 = [11, 20, 0]; // 255
      const index2 = [40, 40, 0]; // 0

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

      // Mouse Down
      const mouseDownEvt = new MouseEvent('mousedown', {
        target: element,
        buttons: 1,
        clientX: clientX1,
        clientY: clientY1,
        pageX: pageX1,
        pageY: pageY1,
      });

      // Mouse Up instantly after
      const mouseUpEvt = new MouseEvent('mouseup');

      await performMouseDownAndUp(element, mouseDownEvt, mouseUpEvt);

      // Grab the probe tool again
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
