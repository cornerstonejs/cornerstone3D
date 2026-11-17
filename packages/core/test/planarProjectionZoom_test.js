import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, viewportProjection } = cornerstone3D;
const { Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const WIDTH = 400;
const HEIGHT = 300;
const ANCHOR = [260, 110];

/** A direct next planar viewport in each content mode, on each draw path. */
const CASES = [
  ['stack', 'GPU', showStack, {}, 'vtkImage'],
  ['volume', 'GPU', showVolume, {}, 'vtkSampledSlice'],
  ['stack', 'CPU', showStack, { renderBackend: 'cpu' }, 'cpuImage'],
  ['volume', 'CPU', showVolume, { renderBackend: 'cpu' }, 'cpuVolume'],
];

/** The red value that the canvas of the viewport shows at a canvas point. */
function redAt(viewport, canvasPoint) {
  const source = viewport.getCanvas();
  const ratio = source.width / WIDTH;
  const canvas = document.createElement('canvas');

  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d').drawImage(source, 0, 0);

  return canvas
    .getContext('2d')
    .getImageData(
      Math.floor(canvasPoint[0] * ratio),
      Math.floor(canvasPoint[1] * ratio),
      1,
      1
    ).data[0];
}

/** Counts the CAMERA_MODIFIED events of a viewport from now on. */
function countCameraEvents(viewport) {
  const counter = { count: 0 };

  viewport.element.addEventListener(Events.CAMERA_MODIFIED, () => {
    counter.count++;
  });

  return counter;
}

describe('The anchor of a zoom in the planar projection -- ', () => {
  let renderingEngine;
  let next;
  let series;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    series = await createSeries();
    next = createNextViewport(renderingEngine, 'nextAnchor');
  }, 15000);

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  for (const [mode, backend, show, options, renderMode] of CASES) {
    const where = `in ${mode} mode on the ${backend}`;

    it(`keeps the world point of the anchor under it for a zoom, as one change of the view state, ${where}`, async function () {
      await show(next, series, 2, options);

      const world = next.canvasToWorld(ANCHOR);
      const redBefore = redAt(next, ANCHOR);
      const events = countCameraEvents(next);

      next.setViewState(
        viewportProjection.withPresentation(next, { zoom: 1.8 }, undefined, {
          anchorCanvas: ANCHOR,
        })
      );
      await renderAndWait(next);

      const shown = next.worldToCanvas(world);
      const presentation = viewportProjection.getPresentation(next);

      expect(next.getCurrentMode()).toBe(mode);
      expect(next.getRenderPlan()[0].renderMode).toBe(renderMode);
      expect(events.count).toBe(1);
      expect(presentation.zoom).toBeCloseTo(1.8, 6);
      expect(presentation.scale[0]).toBeCloseTo(1.8, 6);
      expect(presentation.scale[1]).toBeCloseTo(1.8, 6);
      expect(shown[0]).toBeCloseTo(ANCHOR[0], 4);
      expect(shown[1]).toBeCloseTo(ANCHOR[1], 4);
      expect(Math.abs(redAt(next, ANCHOR) - redBefore)).toBeLessThan(3);
    }, 15000);

    it(`keeps the world point of the anchor under it for a scale of two axes and for a zoom with a rotation ${where}`, async function () {
      await show(next, series, 2, options);

      const world = next.canvasToWorld(ANCHOR);

      next.setViewState(
        viewportProjection.withPresentation(
          next,
          { scale: [1.6, 1.2] },
          undefined,
          { anchorCanvas: ANCHOR }
        )
      );

      const stretched = next.worldToCanvas(world);

      expect(viewportProjection.getPresentation(next).scale[0]).toBeCloseTo(
        1.6,
        6
      );
      expect(viewportProjection.getPresentation(next).scale[1]).toBeCloseTo(
        1.2,
        6
      );
      expect(stretched[0]).toBeCloseTo(ANCHOR[0], 4);
      expect(stretched[1]).toBeCloseTo(ANCHOR[1], 4);

      next.resetViewState();

      const worldAfterReset = next.canvasToWorld(ANCHOR);

      next.setViewState(
        viewportProjection.withPresentation(
          next,
          { zoom: 1.5, rotation: 90 },
          undefined,
          { anchorCanvas: ANCHOR }
        )
      );

      const turned = next.worldToCanvas(worldAfterReset);

      expect(viewportProjection.getPresentation(next).rotation).toBe(90);
      expect(viewportProjection.getPresentation(next).zoom).toBeCloseTo(1.5, 6);
      expect(turned[0]).toBeCloseTo(ANCHOR[0], 4);
      expect(turned[1]).toBeCloseTo(ANCHOR[1], 4);
    }, 15000);

    it(`moves the picture by a pan of the projection service after a zoom at a canvas point, also with a rotation in the patch, ${where}`, async function () {
      await show(next, series, 2, options);

      for (const zoomAtPoint of [
        () =>
          next.setViewState(
            viewportProjection.withPresentation(next, { zoom: 2 }, undefined, {
              anchorCanvas: ANCHOR,
            })
          ),
        () => next.setZoom(2, ANCHOR),
      ]) {
        next.resetViewState();
        zoomAtPoint();

        const before = viewportProjection.getPresentation(next);
        const point = [200, 150];
        const world = next.canvasToWorld(point);

        next.setViewState(
          viewportProjection.withPresentation(next, {
            pan: [before.pan[0] + 10, before.pan[1] - 5],
          })
        );

        const after = viewportProjection.getPresentation(next);
        const shown = next.worldToCanvas(world);

        expect(after.zoom).toBeCloseTo(2, 6);
        expect(after.pan[0]).toBeCloseTo(before.pan[0] + 10, 4);
        expect(after.pan[1]).toBeCloseTo(before.pan[1] - 5, 4);
        expect(shown[0]).toBeCloseTo(point[0] + 20, 4);
        expect(shown[1]).toBeCloseTo(point[1] - 10, 4);

        next.setViewState(
          viewportProjection.withPresentation(next, {
            pan: [7, 3],
            rotation: 90,
            zoom: 1.5,
          })
        );

        const turned = viewportProjection.getPresentation(next);

        expect(turned.rotation).toBe(90);
        expect(turned.zoom).toBeCloseTo(1.5, 6);
        expect(turned.pan[0]).toBeCloseTo(7, 4);
        expect(turned.pan[1]).toBeCloseTo(3, 4);
      }
    }, 15000);

    it(`lets the pan of a patch decide, and zooms about the centre with no anchor, ${where}`, async function () {
      await show(next, series, 2, options);

      const centreWorld = next.canvasToWorld([WIDTH / 2, HEIGHT / 2]);
      const withAnchor = viewportProjection.withPresentation(
        next,
        { zoom: 2, pan: [10, -5] },
        undefined,
        { anchorCanvas: ANCHOR }
      );
      const withoutAnchor = viewportProjection.withPresentation(next, {
        zoom: 2,
        pan: [10, -5],
      });

      expect(withAnchor).toEqual(withoutAnchor);

      next.setViewState(viewportProjection.withPresentation(next, { zoom: 2 }));

      const centre = next.worldToCanvas(centreWorld);

      expect(centre[0]).toBeCloseTo(WIDTH / 2, 4);
      expect(centre[1]).toBeCloseTo(HEIGHT / 2, 4);
    }, 15000);
  }
});

describe('A zoom of the planar projection on a stretched view -- ', () => {
  let renderingEngine;
  let next;
  let series;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    series = await createSeries();
    next = createNextViewport(renderingEngine, 'nextStretch');
  }, 15000);

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  /** The scale of each axis of the view, from the projection service. */
  function scaleOf(viewport) {
    return viewportProjection.getPresentation(viewport).scale;
  }

  for (const [mode, backend, show, options, renderMode] of CASES) {
    const where = `in ${mode} mode on the ${backend}`;

    it(`keeps the ratio of the two axes for a zoom, with and without an anchor and a pan, ${where}`, async function () {
      await show(next, series, 2, options);
      next.setViewState({ scale: [1.5, 1] });

      const read = viewportProjection.getPresentation(next);

      expect(next.getRenderPlan()[0].renderMode).toBe(renderMode);
      expect(read.zoom).toBeCloseTo(1, 6);
      expect(read.scale).toEqual([1.5, 1]);

      next.setViewState(
        viewportProjection.withPresentation(next, { zoom: read.zoom })
      );

      expect(scaleOf(next)).toEqual([1.5, 1]);

      next.setViewState(viewportProjection.withPresentation(next, { zoom: 2 }));

      expect(scaleOf(next)[0]).toBeCloseTo(3, 6);
      expect(scaleOf(next)[1]).toBeCloseTo(2, 6);
      expect(viewportProjection.getPresentation(next).zoom).toBeCloseTo(2, 6);

      const world = next.canvasToWorld(ANCHOR);

      next.setViewState(
        viewportProjection.withPresentation(next, { zoom: 3 }, undefined, {
          anchorCanvas: ANCHOR,
        })
      );

      const shown = next.worldToCanvas(world);

      expect(scaleOf(next)[0]).toBeCloseTo(4.5, 6);
      expect(scaleOf(next)[1]).toBeCloseTo(3, 6);
      expect(shown[0]).toBeCloseTo(ANCHOR[0], 4);
      expect(shown[1]).toBeCloseTo(ANCHOR[1], 4);

      next.setViewState(
        viewportProjection.withPresentation(next, { zoom: 2, pan: [10, -5] })
      );

      const panned = viewportProjection.getPresentation(next);

      expect(panned.scale[0]).toBeCloseTo(3, 6);
      expect(panned.scale[1]).toBeCloseTo(2, 6);
      expect(panned.pan[0]).toBeCloseTo(10, 4);
      expect(panned.pan[1]).toBeCloseTo(-5, 4);
    }, 15000);

    it(`takes a scale of a patch as it is, and setZoom of the class still gives both axes the zoom, ${where}`, async function () {
      await show(next, series, 2, options);
      next.setViewState({ scale: [1.5, 1] });

      next.setViewState(
        viewportProjection.withPresentation(next, { zoom: 4, scale: [2, 2] })
      );

      expect(scaleOf(next)).toEqual([2, 2]);

      next.setViewState({ scale: [1.5, 1] });
      next.setViewState(
        viewportProjection.withPresentation(next, { scale: 3 })
      );

      expect(scaleOf(next)).toEqual([3, 3]);

      next.setViewState({ scale: [1.5, 1] });
      next.setZoom(2);

      expect(scaleOf(next)).toEqual([2, 2]);
    }, 15000);
  }
});
