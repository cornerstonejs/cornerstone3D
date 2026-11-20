import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { utilities, viewportProjection } = cornerstone3D;

const renderingEngineId = utilities.uuidv4();
const WIDTH = 400;
const HEIGHT = 300;
const CENTRE = [WIDTH / 2, HEIGHT / 2];
const SLICE = 2;
const MOUSE = [260, 110];

/**
 * A display area that fits half of the image and puts an image point that
 * is not its centre at the centre of the canvas: a zoom of 2 and a pan.
 */
const DISPLAY_AREA = {
  imageArea: [0.5, 0.5],
  imageCanvasPoint: { imagePoint: [0.25, 0.75], canvasPoint: [0.5, 0.5] },
};

/** A direct next planar viewport in each content mode. */
const MODES = [
  ['stack', showStack],
  ['volume', showVolume],
];

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Waits until the viewport drew what it was asked for. */
async function settle(viewport) {
  await frames();
  await renderAndWait(viewport);
}

/**
 * Where the picture is on the canvas: the canvas point of one voxel of the
 * slice, and the distance in canvas pixels between two voxels, which is the
 * size of the picture.
 */
function pictureOf(viewport, series) {
  const a = viewport.worldToCanvas(worldOfVoxel(series, [8, 6, SLICE]));
  const b = viewport.worldToCanvas(worldOfVoxel(series, [24, 18, SLICE]));

  return { a, size: Math.hypot(b[0] - a[0], b[1] - a[1]) };
}

/** Checks that two pictures have the same place and the same size. */
function expectSamePicture(actual, expected) {
  expect(actual.size).toBeCloseTo(expected.size, 3);
  expect(actual.a[0]).toBeCloseTo(expected.a[0], 2);
  expect(actual.a[1]).toBeCloseTo(expected.a[1], 2);
}

/** Checks that a world point is at the centre of the canvas. */
function expectAtCentre(viewport, worldPoint) {
  const shown = viewport.worldToCanvas(worldPoint);

  expect(shown[0]).toBeCloseTo(CENTRE[0], 2);
  expect(shown[1]).toBeCloseTo(CENTRE[1], 2);
}

/** Shows the series and puts the display area on it with `setDisplayArea`. */
async function showWithDisplayArea(viewport, series, show) {
  await show(viewport, series, SLICE);

  const fit = pictureOf(viewport, series);

  viewport.setDisplayArea(DISPLAY_AREA);
  await settle(viewport);

  return { fit, area: pictureOf(viewport, series) };
}

describe('A planar view answers a zoom, a pan and a stretch as the legacy viewports did -- ', () => {
  let renderingEngine;
  let next;
  let series;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    series = await createSeries();
    next = createNextViewport(renderingEngine, 'nextAsLegacy');
  }, 15000);

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  for (const [mode, show] of MODES) {
    const where = `in ${mode} mode`;

    it(`keeps the picture of a display area through setPan(getPan()) and setZoom(getZoom()), ${where}`, async function () {
      const { fit, area } = await showWithDisplayArea(next, series, show);
      const zoom = next.getZoom();
      const pan = next.getPan();

      expect(area.size / fit.size).toBeCloseTo(2, 3);
      expect(zoom).toBeCloseTo(2, 4);

      next.setPan(pan);
      await settle(next);

      expectSamePicture(pictureOf(next, series), area);
      expect(next.getZoom()).toBeCloseTo(zoom, 4);
      expect(next.getViewState().displayArea).toBeUndefined();

      next.setDisplayArea(DISPLAY_AREA);
      await settle(next);
      next.setZoom(zoom);
      await settle(next);

      expectSamePicture(pictureOf(next, series), area);
      expect(next.getPan()[0]).toBeCloseTo(pan[0], 2);
      expect(next.getPan()[1]).toBeCloseTo(pan[1], 2);
      expect(next.getViewState().displayArea).toBeUndefined();
    }, 20000);

    it(`moves the picture of a display area by setPan at the zoom of the display area, ${where}`, async function () {
      const { area } = await showWithDisplayArea(next, series, show);
      const pan = next.getPan();

      next.setPan([pan[0] + 10, pan[1]]);
      await settle(next);

      const moved = pictureOf(next, series);

      expect(moved.a[0]).toBeCloseTo(area.a[0] + 10, 2);
      expect(moved.a[1]).toBeCloseTo(area.a[1], 2);
      expect(moved.size).toBeCloseTo(area.size, 3);
      expect(next.getZoom()).toBeCloseTo(2, 4);
    }, 20000);

    it(`grows the picture of a display area by setZoom with no point about the centre of the canvas, ${where}`, async function () {
      const { area } = await showWithDisplayArea(next, series, show);
      const atCentre = next.canvasToWorld(CENTRE);

      next.setZoom(3);
      await settle(next);

      expect(pictureOf(next, series).size / area.size).toBeCloseTo(1.5, 3);
      expect(next.getZoom()).toBeCloseTo(3, 4);
      expectAtCentre(next, atCentre);
    }, 20000);

    it(`zooms by setZoom with no point about the centre of the canvas after a pan, ${where}`, async function () {
      await show(next, series, SLICE);
      next.setPan([40, -30]);
      await settle(next);

      const atCentre = next.canvasToWorld(CENTRE);

      next.setZoom(2);
      await settle(next);

      expect(next.getZoom()).toBeCloseTo(2, 4);
      expectAtCentre(next, atCentre);
    }, 20000);

    it(`gives the same view when it writes back the presentation that it read on a display area, ${where}`, async function () {
      const { area } = await showWithDisplayArea(next, series, show);
      const presentation = viewportProjection.getPresentation(next);

      expect(presentation.zoom).toBeCloseTo(2, 4);

      next.setViewState(
        viewportProjection.withPresentation(next, presentation)
      );
      await settle(next);

      const back = viewportProjection.getPresentation(next);

      expectSamePicture(pictureOf(next, series), area);
      expect(back.zoom).toBeCloseTo(presentation.zoom, 4);
      expect(back.pan[0]).toBeCloseTo(presentation.pan[0], 3);
      expect(back.pan[1]).toBeCloseTo(presentation.pan[1], 3);
    }, 20000);

    it(`takes a zoom and a scale next to a display area in a patch against the fit, ${where}`, async function () {
      const { fit } = await showWithDisplayArea(next, series, show);
      const areaPan = viewportProjection.getPresentation(next).pan;

      next.setViewState(
        viewportProjection.withPresentation(next, {
          displayArea: DISPLAY_AREA,
          zoom: 3,
        })
      );
      await settle(next);

      const zoomed = viewportProjection.getPresentation(next);

      expect(pictureOf(next, series).size / fit.size).toBeCloseTo(3, 3);
      expect(zoomed.zoom).toBeCloseTo(3, 4);
      expect(zoomed.pan[0]).toBeCloseTo(areaPan[0], 3);
      expect(zoomed.pan[1]).toBeCloseTo(areaPan[1], 3);
      expect(next.getViewState().displayArea).toEqual(DISPLAY_AREA);

      next.setViewState(
        viewportProjection.withPresentation(next, {
          displayArea: DISPLAY_AREA,
          scale: [2.5, 2.5],
        })
      );
      await settle(next);

      expect(pictureOf(next, series).size / fit.size).toBeCloseTo(2.5, 3);
      expect(viewportProjection.getPresentation(next).zoom).toBeCloseTo(2.5, 4);
      expect(next.getViewState().displayArea).toEqual(DISPLAY_AREA);
    }, 20000);

    it(`zooms by a patch with no anchor about the centre of the canvas after a pan and after a zoom at a point, ${where}`, async function () {
      await show(next, series, SLICE);
      next.setViewState(
        viewportProjection.withPresentation(next, { pan: [40, -30] })
      );
      await settle(next);

      const atCentre = next.canvasToWorld(CENTRE);

      next.setViewState(viewportProjection.withPresentation(next, { zoom: 2 }));
      await settle(next);

      expect(viewportProjection.getPresentation(next).zoom).toBeCloseTo(2, 4);
      expectAtCentre(next, atCentre);

      next.setViewState(
        viewportProjection.withPresentation(next, { zoom: 2.5 }, undefined, {
          anchorCanvas: MOUSE,
        })
      );
      await settle(next);

      const atCentreAfterAnchor = next.canvasToWorld(CENTRE);

      next.setViewState(viewportProjection.withPresentation(next, { zoom: 3 }));
      await settle(next);

      expect(viewportProjection.getPresentation(next).zoom).toBeCloseTo(3, 4);
      expectAtCentre(next, atCentreAfterAnchor);
      expect(next.getViewState().anchorWorld).toBeDefined();

      next.setViewState({ displayArea: DISPLAY_AREA });
      await settle(next);

      const atCentreOfArea = next.canvasToWorld(CENTRE);

      next.setViewState(viewportProjection.withPresentation(next, { zoom: 4 }));
      await settle(next);

      expect(viewportProjection.getPresentation(next).zoom).toBeCloseTo(4, 4);
      expectAtCentre(next, atCentreOfArea);
      expect(next.getViewState().displayArea).toBeUndefined();
      expect(next.getViewState().anchorWorld).toBeUndefined();
    }, 20000);

    it(`answers the stretch of its scale pair from getAspectRatio, ${where}`, async function () {
      await show(next, series, SLICE);

      expect(next.getAspectRatio()).toEqual([1, 1]);

      const cases = [
        [{ scale: [2, 1], scaleMode: 'fit' }, [2, 1]],
        [{ scale: [3, 1.5], scaleMode: 'fit' }, [2, 1]],
        [{ scale: [1, 2], scaleMode: 'fit' }, [1, 2]],
        [{ scale: [2, 1], scaleMode: 'fitAspect' }, [2, 1]],
        [{ scale: [1.5, 1.5], scaleMode: 'fit' }, [1, 1]],
      ];

      for (const [viewState, aspectRatio] of cases) {
        next.setViewState(viewState);
        await settle(next);

        const answer = next.getAspectRatio();

        expect(answer[0]).toBeCloseTo(aspectRatio[0], 6);
        expect(answer[1]).toBeCloseTo(aspectRatio[1], 6);
      }
    }, 20000);
  }
});
