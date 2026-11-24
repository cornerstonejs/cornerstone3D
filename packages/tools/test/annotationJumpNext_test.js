import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  waitFor,
  drawPathOf,
} from '../../core/test/utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { OrientationAxis } = Enums;
const { LengthTool, ProbeTool, annotation: annotations } = csTools3d;
const { filterAnnotationsForDisplay } = csTools3d.utilities.planar;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'annotationJumpNext';

/** The image of the series that the annotations are made on. */
const IMAGE = 2;

/** The two canvas points of the drawn length. */
const LINE = [
  [150, 120],
  [250, 180],
];

/**
 * A direct next planar viewport in each content mode, on the GPU and on the
 * CPU. The slice index of the acquisition view of a volume runs against the
 * order of the image ids, and that of a view by vectors along the slices
 * runs with it.
 */
const CASES = [
  ['in stack mode on the GPU', showStack, {}, 'frame-gpu'],
  [
    'in stack mode on the CPU',
    showStack,
    { renderBackend: 'cpu' },
    'frame-cpu',
  ],
  [
    'in volume mode on the GPU, where the slices run against the order of the images',
    showVolume,
    { orientation: OrientationAxis.ACQUISITION },
    'cpu-gpu',
  ],
  [
    'in volume mode on the CPU, where the slices run against the order of the images',
    showVolume,
    { orientation: OrientationAxis.ACQUISITION, renderBackend: 'cpu' },
    'cpu-cpu',
  ],
  [
    'in volume mode on the GPU, where the slices run with the order of the images',
    showVolume,
    { orientation: { viewPlaneNormal: [0, 0, 1], viewUp: [0, -1, 0] } },
    'cpu-gpu',
  ],
  [
    'in volume mode on the CPU, where the slices run with the order of the images',
    showVolume,
    {
      orientation: { viewPlaneNormal: [0, 0, 1], viewUp: [0, -1, 0] },
      renderBackend: 'cpu',
    },
    'cpu-cpu',
  ],
];

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Waits until the viewport drew what it was asked for, with its tools. */
async function settle(viewport) {
  await frames();
  await renderAndWait(viewport);
  await frames();
}

/** The mouse event of a type at a canvas point of the element. */
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

/**
 * Draws a line with the length tool on the slice on display, and gives its
 * annotation once the tool worked out its length.
 */
async function drawLength(viewport) {
  const { element } = viewport;
  const drawn = () =>
    (annotations.state.getAnnotations(LengthTool.toolName, element) ?? []).find(
      (candidate) => Object.keys(candidate.data.cachedStats ?? {}).length > 0
    );

  element.dispatchEvent(mouseEventAt(element, 'mousedown', LINE[0]));
  document.dispatchEvent(mouseEventAt(element, 'mousemove', LINE[1]));
  document.dispatchEvent(mouseEventAt(element, 'mouseup', LINE[1]));
  await waitFor(() => Boolean(drawn()));

  return drawn();
}

/** Makes the annotation of a probe on the slice on display, as the tool. */
function makeProbe(viewport) {
  const probe = ProbeTool.createAnnotationForViewport(viewport, {
    data: { handles: { points: [viewport.canvasToWorld(LINE[0])] } },
  });

  annotations.state.addAnnotation(probe, viewport.element);

  return probe;
}

/** Whether the element shows the line of a length annotation. */
function showsLineOf(viewport, lengthAnnotation) {
  return Boolean(
    viewport.element.querySelector(
      `svg [data-id="${lengthAnnotation.annotationUID}-line"]`
    )
  );
}

/** What the viewport says about an annotation and the image on display. */
function stateOf(viewport, series, annotation) {
  return {
    image: series.imageIds.indexOf(viewport.getCurrentImageId()),
    viewable: viewport.isReferenceViewable(annotation.metadata),
    drawn: filterAnnotationsForDisplay(viewport, [annotation]).length === 1,
  };
}

describe('A jump to an annotation on a direct next planar viewport -- ', () => {
  let renderingEngine;
  let toolGroup;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [LengthTool, ProbeTool],
      toolActivations: {
        [LengthTool.toolName]: { bindings: [{ mouseButton: 1 }] },
      },
    });

    renderingEngine = testEnv.renderingEngine;
    toolGroup = testEnv.toolGroups[toolGroupId];
  });

  afterEach(function () {
    annotations.state.removeAllAnnotations();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  for (const [where, show, options, drawPath] of CASES) {
    it(`shows the annotation of a length and of a probe again after a scroll away, by setViewReference with its metadata, ${where}`, async function () {
      const series = await createSeries({ id: `jump-${drawPath}` });
      const viewport = createNextViewport(renderingEngine, 'nextJump');

      toolGroup.addViewport(viewport.id, renderingEngineId);
      await show(viewport, series, IMAGE, options);

      expect(drawPathOf(viewport.getRenderPlan()[0])).toBe(drawPath);
      expect(viewport.getCurrentImageId()).toBe(series.imageIds[IMAGE]);

      const length = await drawLength(viewport);
      const probe = makeProbe(viewport);
      const onItsImage = { image: IMAGE, viewable: true, drawn: true };

      await settle(viewport);

      expect(length.metadata.referencedImageId).toBe(series.imageIds[IMAGE]);
      expect(probe.metadata.referencedImageId).toBe(series.imageIds[IMAGE]);
      expect(stateOf(viewport, series, length)).toEqual(onItsImage);
      expect(stateOf(viewport, series, probe)).toEqual(onItsImage);
      expect(showsLineOf(viewport, length)).toBe(true);

      for (const annotation of [length, probe]) {
        await viewport.scroll(3);
        await settle(viewport);

        const away = stateOf(viewport, series, annotation);

        expect(away.image).not.toBe(IMAGE);
        expect(away.image).not.toBe(-1);
        expect(away.viewable).toBe(false);
        expect(away.drawn).toBe(false);
        expect(showsLineOf(viewport, length)).toBe(false);

        viewport.setViewReference(annotation.metadata);
        await settle(viewport);

        expect(stateOf(viewport, series, annotation)).toEqual(onItsImage);
        expect(showsLineOf(viewport, length)).toBe(true);
      }

      await viewport.scroll(3);
      await settle(viewport);

      expect(showsLineOf(viewport, length)).toBe(false);

      LengthTool.createAnnotationMemo(viewport.element, length).restoreMemo();
      await settle(viewport);

      expect(stateOf(viewport, series, length)).toEqual(onItsImage);
      expect(showsLineOf(viewport, length)).toBe(true);
    });
  }
});
