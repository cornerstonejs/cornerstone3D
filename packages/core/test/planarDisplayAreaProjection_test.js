import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  worldOfVoxel,
  drawPathOf,
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

/** A direct next planar viewport in each content mode, on each draw path. */
const CASES = [
  ['stack', 'GPU', showStack, {}, 'frame-gpu'],
  ['volume', 'GPU', showVolume, {}, 'cpu-gpu'],
  ['stack', 'CPU', showStack, { renderBackend: 'cpu' }, 'frame-cpu'],
  ['volume', 'CPU', showVolume, { renderBackend: 'cpu' }, 'cpu-cpu'],
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

/** One canvas for every read of a pixel: a read makes no canvas of its own. */
const pixelReader = document.createElement('canvas');

/** The red value that the canvas of the viewport shows at a canvas point. */
function redAt(viewport, canvasPoint) {
  const source = viewport.getCanvas();
  const ratio = source.width / WIDTH;
  const context = pixelReader.getContext('2d', { willReadFrequently: true });

  if (
    pixelReader.width !== source.width ||
    pixelReader.height !== source.height
  ) {
    pixelReader.width = source.width;
    pixelReader.height = source.height;
  }

  context.clearRect(0, 0, pixelReader.width, pixelReader.height);
  context.drawImage(source, 0, 0);

  return context.getImageData(
    Math.floor(canvasPoint[0] * ratio),
    Math.floor(canvasPoint[1] * ratio),
    1,
    1
  ).data[0];
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

/** The zoom, the pan and the scale that the projection service gives. */
function presentationOf(viewport) {
  return viewportProjection.getFraming(viewport, {
    selector: { zoom: true, pan: true, scale: true },
  });
}

/**
 * Checks that the zoom and the pan of the projection service are the ones on
 * the screen: the picture is `zoom` times its fitted size, and `pan * scale`
 * canvas pixels from its fitted place.
 */
function expectPresentationOnScreen(viewport, series, fit) {
  const { zoom, pan, scale } = presentationOf(viewport);
  const { a, size } = pictureOf(viewport, series);

  expect(size / fit.size).toBeCloseTo(zoom, 3);
  expect(a[0]).toBeCloseTo(
    CENTRE[0] + (fit.a[0] - CENTRE[0]) * scale[0] + pan[0] * scale[0],
    2
  );
  expect(a[1]).toBeCloseTo(
    CENTRE[1] + (fit.a[1] - CENTRE[1]) * scale[1] + pan[1] * scale[1],
    2
  );
}

/**
 * Shows the series, measures the fitted picture, and puts the display area
 * into the view state. Gives the fitted picture and the picture of the
 * display area.
 */
async function showWithDisplayArea(viewport, series, show, options) {
  await show(viewport, series, SLICE, options);

  const fit = pictureOf(viewport, series);

  viewport.setViewState({ displayArea: DISPLAY_AREA });
  await settle(viewport);

  return { fit, area: pictureOf(viewport, series) };
}

describe('The projection service on a planar view with a display area -- ', () => {
  let renderingEngine;
  let next;
  let series;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    series = await createSeries();
    next = createNextViewport(renderingEngine, 'nextDisplayArea');
  }, 15000);

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  for (const [mode, backend, show, options, drawPath] of CASES) {
    const where = `in ${mode} mode on the ${backend}`;

    it(`moves the picture by a pan patch from where the display area put it, at the size that the display area gave, ${where}`, async function () {
      const { fit, area } = await showWithDisplayArea(
        next,
        series,
        show,
        options
      );
      const { zoom, pan, scale } = presentationOf(next);
      const greyOfVoxel = redAt(next, area.a);

      expect(next.getCurrentMode()).toBe(mode);
      expect(drawPathOf(next.getRenderPlan()[0])).toBe(drawPath);
      expect(zoom).toBeCloseTo(2, 4);
      expect(area.size / fit.size).toBeCloseTo(2, 3);
      expect(Math.hypot(pan[0], pan[1])).toBeGreaterThan(10);
      expectPresentationOnScreen(next, series, fit);

      next.setViewState(
        viewportProjection.withFraming(next, {
          pan: [pan[0] + 20, pan[1] - 15],
        })
      );
      await settle(next);

      const moved = pictureOf(next, series);
      const after = presentationOf(next);

      expect(moved.a[0]).toBeCloseTo(area.a[0] + 20 * scale[0], 2);
      expect(moved.a[1]).toBeCloseTo(area.a[1] - 15 * scale[1], 2);
      expect(moved.size).toBeCloseTo(area.size, 3);
      expect(next.getViewState().displayArea).toBeUndefined();
      expect(after.zoom).toBeCloseTo(2, 4);
      expect(after.pan[0]).toBeCloseTo(pan[0] + 20, 3);
      expect(after.pan[1]).toBeCloseTo(pan[1] - 15, 3);
      expectPresentationOnScreen(next, series, fit);
      expect(Math.abs(redAt(next, moved.a) - greyOfVoxel)).toBeLessThan(2);
    }, 15000);

    it(`grows the picture by a zoom patch from the size that the display area gave, about the anchor as setZoom of the class and about the centre of the canvas without one, ${where}`, async function () {
      const { fit, area } = await showWithDisplayArea(
        next,
        series,
        show,
        options
      );
      const underMouse = next.canvasToWorld(MOUSE);

      next.setViewState(
        viewportProjection.withFraming(next, { zoom: 2.5 }, undefined, {
          anchorCanvas: MOUSE,
        })
      );
      await settle(next);

      const anchored = pictureOf(next, series);
      const shown = next.worldToCanvas(underMouse);

      expect(anchored.size / area.size).toBeCloseTo(1.25, 3);
      expect(shown[0]).toBeCloseTo(MOUSE[0], 2);
      expect(shown[1]).toBeCloseTo(MOUSE[1], 2);
      expect(next.getViewState().displayArea).toBeUndefined();
      expect(presentationOf(next).zoom).toBeCloseTo(2.5, 4);
      expectPresentationOnScreen(next, series, fit);

      next.setViewState(
        viewportProjection.withFraming(next, { displayArea: DISPLAY_AREA })
      );
      await settle(next);
      next.setZoom(2.5, MOUSE);
      await settle(next);

      const byTheClass = pictureOf(next, series);

      expect(byTheClass.a[0]).toBeCloseTo(anchored.a[0], 2);
      expect(byTheClass.a[1]).toBeCloseTo(anchored.a[1], 2);
      expect(byTheClass.size).toBeCloseTo(anchored.size, 3);

      next.setViewState(
        viewportProjection.withFraming(next, { displayArea: DISPLAY_AREA })
      );
      await settle(next);

      const back = pictureOf(next, series);
      const atTheCentre = next.canvasToWorld(CENTRE);

      expect(back.a[0]).toBeCloseTo(area.a[0], 2);
      expect(back.a[1]).toBeCloseTo(area.a[1], 2);
      expect(back.size).toBeCloseTo(area.size, 3);

      next.setViewState(viewportProjection.withFraming(next, { zoom: 3 }));
      await settle(next);

      const grown = pictureOf(next, series);
      const centre = next.worldToCanvas(atTheCentre);

      expect(grown.size / area.size).toBeCloseTo(1.5, 3);
      expect(centre[0]).toBeCloseTo(CENTRE[0], 2);
      expect(centre[1]).toBeCloseTo(CENTRE[1], 2);
      expect(next.getViewState().displayArea).toBeUndefined();
      expect(presentationOf(next).zoom).toBeCloseTo(3, 4);
      expectPresentationOnScreen(next, series, fit);
    }, 15000);

    it(`drops an old world anchor for a patch with a display area ${where}`, async function () {
      await show(next, series, SLICE, options);

      const fit = pictureOf(next, series);

      next.setZoom(1.5, MOUSE);
      await settle(next);

      expect(next.getViewState().anchorWorld).toBeDefined();

      next.setViewState(
        viewportProjection.withFraming(next, {
          displayArea: DISPLAY_AREA,
        })
      );
      await settle(next);

      const area = pictureOf(next, series);

      expect(next.getViewState().displayArea).toEqual(DISPLAY_AREA);
      expect(next.getViewState().anchorWorld).toBeUndefined();
      expect(area.size / fit.size).toBeCloseTo(2, 3);

      next.setViewState({ displayArea: undefined });
      await settle(next);

      const cleared = pictureOf(next, series);

      expect(cleared.a[0]).toBeCloseTo(fit.a[0], 2);
      expect(cleared.a[1]).toBeCloseTo(fit.a[1], 2);
      expect(cleared.size).toBeCloseTo(fit.size, 3);
    }, 15000);
  }
});
