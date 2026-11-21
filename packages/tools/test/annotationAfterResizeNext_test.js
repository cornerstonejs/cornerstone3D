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
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities } = cornerstone3D;
const { LengthTool, annotation: annotations } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'annotationAfterResizeNext';
const PIXEL_TOLERANCE = 1;
const ANNOTATION_UID = 'lengthAfterResize';

/** The image of the series that the annotation is made on. */
const IMAGE = 2;

/** The two canvas points of the length, on the canvas of 400 by 300. */
const LINE = [
  [150, 120],
  [250, 180],
];

const CASES = [
  ['in stack mode on the GPU', showStack, {}],
  ['in stack mode on the CPU', showStack, { renderBackend: 'cpu' }],
  ['in volume mode on the GPU', showVolume, {}],
  ['in volume mode on the CPU', showVolume, { renderBackend: 'cpu' }],
];

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** The two end points of the drawn line of the length annotation. */
function drawnLineOf(viewport) {
  const line = viewport.element.querySelector(
    `svg [data-id="${ANNOTATION_UID}-line"]`
  );

  return [
    [Number(line.getAttribute('x1')), Number(line.getAttribute('y1'))],
    [Number(line.getAttribute('x2')), Number(line.getAttribute('y2'))],
  ];
}

/** Whether the drawn line has the two end points, within a pixel. */
function isLineAt(viewport, expected) {
  return drawnLineOf(viewport).every((point, index) =>
    point.every(
      (value, axis) =>
        Math.abs(value - expected[index][axis]) <= PIXEL_TOLERANCE
    )
  );
}

describe('An annotation on a direct next planar viewport whose element changed size -- ', () => {
  let renderingEngine;
  let toolGroup;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [LengthTool],
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

  for (const [where, show, options] of CASES) {
    it(`is drawn at its place on the new canvas after a resize that meets a scheduled frame, ${where}`, async function () {
      const series = await createSeries({ id: `afterResize-${where}` });
      const viewport = createNextViewport(renderingEngine, 'nextAfterResize');

      toolGroup.addViewport(viewport.id, renderingEngineId);
      await show(viewport, series, IMAGE, options);

      LengthTool.hydrate(
        viewport.id,
        LINE.map((point) => viewport.canvasToWorld(point)),
        { annotationUID: ANNOTATION_UID }
      );

      await renderAndWait(viewport);
      await frames();
      expect(isLineAt(viewport, LINE)).toBe(true);

      viewport.element.style.width = '200px';
      viewport.element.style.height = '150px';
      renderingEngine.render();
      renderingEngine.resize(false);
      renderingEngine.render();
      await frames(4);

      const halved = LINE.map(([x, y]) => [x / 2, y / 2]);

      await waitFor(() => isLineAt(viewport, halved)).catch(() => undefined);
      expect(
        drawnLineOf(viewport).map((point) => point.map(Math.round))
      ).toEqual(halved);
    });
  }
});
