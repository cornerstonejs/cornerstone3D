import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { performMouseDownAndUp } from '../../../utils/test/testUtilsMouseEvents';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  animationFrames,
  waitFor,
} from '../../../utils/test/testUtilsVideo';

const { Enums, utilities, getConfiguration } = cornerstone3D;
const { ViewportType } = Enums;
const {
  ProbeTool,
  PlanarFreehandContourSegmentationTool,
  annotation,
  segmentation,
  utilities: toolsUtilities,
  Enums: csToolsEnums,
} = csTools3d;
const { AnnotationMultiSlice } = toolsUtilities;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'videoTools';
const WIDTH = 320;
const HEIGHT = 200;

/**
 * Makes a legacy video viewport and a direct next video viewport of one size
 * in one rendering engine and adds both to the tool group.
 */
function createViewports(renderingEngine, toolGroup) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;
  const viewportOptions = {
    width: WIDTH,
    height: HEIGHT,
    useEnableElement: true,
    orientation: null,
  };

  rendering.useGenericViewport = false;
  testUtils.createViewports(renderingEngine, {
    ...viewportOptions,
    viewportId: 'legacyVideo',
    viewportType: ViewportType.VIDEO,
  });
  rendering.useGenericViewport = useGenericViewport;
  testUtils.createViewports(renderingEngine, {
    ...viewportOptions,
    viewportId: 'nextVideo',
    viewportType: ViewportType.VIDEO_NEXT,
  });
  toolGroup.addViewport('legacyVideo', renderingEngineId);
  toolGroup.addViewport('nextVideo', renderingEngineId);

  return [
    renderingEngine.getViewport('legacyVideo'),
    renderingEngine.getViewport('nextVideo'),
  ];
}

/** Shows the test video on both viewports on one frame, paused. */
async function showVideo(legacy, next, frameNumber) {
  await legacy.setVideo(TEST_VIDEO.imageId, frameNumber);
  await next.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });
  next.setFrameNumber(frameNumber);
  await waitFor(
    () =>
      legacy.videoElement.paused &&
      !legacy.videoElement.seeking &&
      legacy.getFrameNumber() === frameNumber &&
      !next.element.querySelector('video').seeking &&
      next.getFrameNumber() === frameNumber
  );
  await animationFrames(3);
}

/** The mouse event of a click at a canvas point of the element. */
function mouseEventAt(element, type, canvasPoint) {
  const rect = element.getBoundingClientRect();
  const clientX = Math.round(rect.left + canvasPoint[0]);
  const clientY = Math.round(rect.top + canvasPoint[1]);

  return new MouseEvent(type, {
    clientX,
    clientY,
    pageX: clientX + window.pageXOffset,
    pageY: clientY + window.pageYOffset,
    buttons: 1,
    bubbles: true,
  });
}

/** Places a probe with a click at a canvas point of the viewport. */
async function clickProbe(viewport, canvasPoint) {
  const { element } = viewport;
  const down = mouseEventAt(element, 'mousedown', canvasPoint);
  const up = mouseEventAt(element, 'mouseup', canvasPoint);

  await performMouseDownAndUp(element, down, up);
  await waitFor(
    () =>
      Object.values(probeOf(element)?.data.cachedStats ?? {})[0]?.value !==
      undefined,
    2000
  ).catch(() => undefined);

  return probeOf(element);
}

/** The probe annotation of an element. */
function probeOf(element) {
  return annotation.state.getAnnotations(ProbeTool.toolName, element)?.[0];
}

/** The centre of the drawn probe of an element. */
function drawnProbeCentre(element) {
  const circle = element.querySelector('svg circle');

  return (
    circle && [
      Number(circle.getAttribute('cx')),
      Number(circle.getAttribute('cy')),
    ]
  );
}

describe('Tools on a direct next video viewport -- ', () => {
  let renderingEngine;
  let videoUrl;
  let legacy;
  let next;

  beforeEach(async function () {
    const setup = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [ProbeTool],
      toolActivations: {
        [ProbeTool.toolName]: { bindings: [{ mouseButton: 1 }] },
      },
    });

    renderingEngine = setup.renderingEngine;
    videoUrl = addTestVideoMetadata();
    [legacy, next] = createViewports(
      renderingEngine,
      setup.toolGroups[toolGroupId]
    );
    await showVideo(legacy, next, 6);
  }, 15000);

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
    URL.revokeObjectURL(videoUrl);
  });

  it('measures a probe on the frame as the legacy viewport does', async function () {
    const world = [10, 20, 0];
    const legacyProbe = await clickProbe(legacy, legacy.worldToCanvas(world));
    const legacyPoint = [...legacyProbe.data.handles.points[0]];
    const legacyStats = {
      ...Object.values(legacyProbe.data.cachedStats)[0],
    };

    annotation.state.removeAllAnnotations();
    renderingEngine.disableElement('legacyVideo');

    const nextProbe = await clickProbe(next, next.worldToCanvas(world));
    const nextStats = Object.values(nextProbe.data.cachedStats)[0];

    nextProbe.data.handles.points[0].forEach((value, axis) =>
      expect(value).toBeCloseTo(legacyPoint[axis], 0)
    );
    expect(legacyStats.value).toBeDefined();
    expect(nextStats.value).toEqual(legacyStats.value);
    expect(nextStats.index).toEqual(legacyStats.index);
  }, 15000);

  it('draws the probe where its point is after a pan', async function () {
    const nextProbe = await clickProbe(next, next.worldToCanvas([10, 20, 0]));
    const point = nextProbe.data.handles.points[0];

    await waitFor(() => drawnProbeCentre(next.element));
    next.setPan([15, -10]);
    await animationFrames(4);

    const expected = next.worldToCanvas(point);
    const drawn = drawnProbeCentre(next.element);

    expect(drawn[0]).toBeCloseTo(expected[0], 0);
    expect(drawn[1]).toBeCloseTo(expected[1], 0);
  }, 15000);

  it('shows a probe over the frame range of AnnotationMultiSlice as the legacy viewport does', async function () {
    const goTo = async (frameNumber) => {
      legacy.setFrameNumber(frameNumber);
      next.setFrameNumber(frameNumber);
      await waitFor(
        () =>
          legacy.getFrameNumber() === frameNumber &&
          next.getFrameNumber() === frameNumber,
        10000
      );
    };
    const legacyProbe = await clickProbe(
      legacy,
      legacy.worldToCanvas([10, 20, 0])
    );
    const legacyMetadata = { ...legacyProbe.metadata };

    annotation.state.removeAllAnnotations();

    const nextProbe = await clickProbe(next, next.worldToCanvas([10, 20, 0]));

    AnnotationMultiSlice.setRange(legacy, { metadata: legacyMetadata }, 2, 8);
    AnnotationMultiSlice.setRange(next, nextProbe, 2, 8);

    expect(AnnotationMultiSlice.getFrameRange(nextProbe)).toEqual([3, 9]);
    expect(next.getFrameRange()).toEqual(legacy.getFrameRange());

    for (const [frameNumber, viewable] of [
      [3, true],
      [4, true],
      [9, true],
      [2, false],
      [11, false],
    ]) {
      await goTo(frameNumber);
      expect(legacy.isReferenceViewable(legacyMetadata)).toBe(viewable);
      expect(next.isReferenceViewable(nextProbe.metadata)).toBe(viewable);
    }
  }, 60000);

  it('draws a contour segmentation on its frame as the legacy viewport does', async function () {
    const segmentationId = 'videoContours';
    const reference = next.getViewReference();
    const polyline = [
      [10, 10, 0],
      [40, 10, 0],
      [40, 35, 0],
      [10, 35, 0],
    ];
    const contourAnnotation = {
      annotationUID: utilities.uuidv4(),
      data: {
        contour: { closed: true, polyline },
        segmentation: { segmentationId, segmentIndex: 1 },
        handles: {},
      },
      highlighted: false,
      autoGenerated: false,
      invalidated: false,
      isLocked: false,
      isVisible: true,
      metadata: {
        toolName: PlanarFreehandContourSegmentationTool.toolName,
        FrameOfReferenceUID: reference.FrameOfReferenceUID,
        referencedImageId: reference.referencedImageId,
        sliceIndex: reference.sliceIndex,
        viewPlaneNormal: [0, 0, 1],
      },
    };

    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Contour,
        },
        config: { segments: { 1: { label: 'Segment 1' } } },
      },
    ]);
    annotation.state.addAnnotation(contourAnnotation, next.element);
    toolsUtilities.contourSegmentation.addContourSegmentationAnnotation(
      contourAnnotation
    );

    for (const viewport of [legacy, next]) {
      await segmentation.addSegmentationRepresentations(viewport.id, [
        {
          segmentationId,
          type: csToolsEnums.SegmentationRepresentations.Contour,
        },
      ]);
    }

    const drawnContour = (element) =>
      element.querySelector('svg polyline, svg path, svg polygon');

    legacy.render();
    next.render();
    await waitFor(
      () => drawnContour(legacy.element) && drawnContour(next.element),
      5000
    );

    expect(drawnContour(legacy.element)).not.toBeNull();
    expect(drawnContour(next.element)).not.toBeNull();

    const box = drawnContour(next.element).getBBox();
    const topLeft = next.worldToCanvas(polyline[0]);
    const bottomRight = next.worldToCanvas(polyline[2]);

    expect(box.x).toBeCloseTo(topLeft[0], 0);
    expect(box.y).toBeCloseTo(topLeft[1], 0);
    expect(box.x + box.width).toBeCloseTo(bottomRight[0], 0);
    expect(box.y + box.height).toBeCloseTo(bottomRight[1], 0);

    next.setFrameNumber(12);
    await waitFor(() => next.getFrameNumber() === 12, 10000);
    await animationFrames(4);

    expect(drawnContour(next.element)).toBeNull();
  }, 30000);
});
