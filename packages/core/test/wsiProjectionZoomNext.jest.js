import { describe, it, expect, afterEach } from '@jest/globals';
import WSIViewport from '../src/RenderingEngine/Viewports/WSI/WSIViewport';
import { viewportProjection } from '../src/RenderingEngine/Viewports/viewportProjection';
import {
  COLUMNS,
  HEIGHT,
  ROWS,
  WIDTH,
  mountNext,
  unmount,
} from './utils/wsiStandIn';

/** The map resolution of the stand-in at map zoom level 0. */
const MAX_RESOLUTION = 32;

/**
 * The resolution at which the microscopy viewer fits the slide of the
 * stand-in to the canvas of 400 by 300 pixels, as `View.fit` computes it for
 * the extent of the map projection `[0, -ROWS, COLUMNS, 0]` turned by the
 * rotation of the slide: the larger of the two ratios of the turned extent
 * to the canvas.
 */
function fitResolution(slideRotation) {
  const cos = Math.abs(Math.cos(slideRotation));
  const sin = Math.abs(Math.sin(slideRotation));
  const width = COLUMNS * cos + ROWS * sin;
  const height = COLUMNS * sin + ROWS * cos;

  return Math.max(width / WIDTH, height / HEIGHT);
}

/** The zoom and the pan of a viewport from the projection service. */
function zoomPanOf(viewport) {
  return viewportProjection.getFraming(viewport, {
    selector: { zoom: true, pan: true },
  });
}

/** Applies a presentation patch through the projection service. */
function present(viewport, presentation, options) {
  viewport.setViewState(
    viewportProjection.withFraming(viewport, presentation, undefined, options)
  );
}

function expectClose(actual, expected, precision = 3) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], precision)
  );
}

const mounted = [];

async function track(promise) {
  const made = await promise;

  mounted.push(made);

  return made;
}

afterEach(() => {
  mounted.splice(0).forEach(unmount);
});

describe('The zoom of a direct next whole slide viewport in the projection service', () => {
  [0, 0.4].forEach((slideRotation) => {
    it(`is a factor against the fit of the microscopy viewer, for a slide turned by ${slideRotation}: 1 at the fit, 2 at half its resolution`, async () => {
      const { viewport, view } = await track(
        mountNext(WSIViewport, slideRotation)
      );
      const fit = fitResolution(slideRotation);

      expect(zoomPanOf(viewport).zoom).toBeCloseTo(
        fit / view.getResolution(),
        6
      );

      view.setResolution(fit);
      expect(zoomPanOf(viewport).zoom).toBeCloseTo(1, 9);

      view.setResolution(fit / 2);
      expect(zoomPanOf(viewport).zoom).toBeCloseTo(2, 9);

      view.setResolution(fit * 4);
      expect(zoomPanOf(viewport).zoom).toBeCloseTo(0.25, 9);
    });
  });

  it('does not change when the view turns: the fit is the one of the slide as the viewer turns it', async () => {
    const { viewport, view } = await track(mountNext(WSIViewport, 0.4));
    const before = zoomPanOf(viewport).zoom;

    viewport.setViewState({ rotation: 30 });

    expect(view.getRotation()).not.toBeCloseTo(0.4, 3);
    expect(zoomPanOf(viewport).zoom).toBeCloseTo(before, 9);
  });

  it('takes the snap of the fit of a map view that snaps resolutions, as View.fit does', async () => {
    const { viewport, view } = await track(mountNext(WSIViewport, 0));

    view.getConstrainedResolution = (resolution, direction) => {
      expect(direction).toBe(1);

      return 2 ** Math.ceil(Math.log2(resolution));
    };
    view.setResolution(128);

    expect(fitResolution(0)).toBe(100);
    expect(zoomPanOf(viewport).zoom).toBeCloseTo(1, 9);
  });

  it('writes a zoom as a factor against the fit: zoom 2 sets half the fit resolution, about an anchor point', async () => {
    const { viewport, view } = await track(mountNext(WSIViewport, 0.4));
    const anchor = [310, 80];
    const underAnchor = viewport.canvasToWorld(anchor);

    present(viewport, { zoom: 2 }, { anchorCanvas: anchor });

    expect(view.getResolution()).toBeCloseTo(fitResolution(0.4) / 2, 6);
    expect(zoomPanOf(viewport).zoom).toBeCloseTo(2, 6);
    expectClose(viewport.worldToCanvas(underAnchor), anchor);
  });

  it('writes a zoom and a pan together: the pan is in canvas pixels divided by the zoom', async () => {
    const { viewport } = await track(mountNext(WSIViewport, 0.4));
    const centre = [WIDTH / 2, HEIGHT / 2];

    present(viewport, { zoom: 3, pan: [10, -5] });

    const { zoom, pan } = zoomPanOf(viewport);

    expect(zoom).toBeCloseTo(3, 6);
    expectClose(pan, [10, -5]);

    const slideCentre = viewport.canvasToWorld([
      centre[0] + pan[0] * zoom,
      centre[1] + pan[1] * zoom,
    ]);

    present(viewport, { pan: [0, 0] });

    expectClose(viewport.worldToCanvas(slideCentre), centre);
  });

  it('leaves getZoom and setZoom with the zoom level of the map', async () => {
    const { viewport, view } = await track(mountNext(WSIViewport, 0.4));

    expect(viewport.getZoom()).toBeCloseTo(
      Math.log2(MAX_RESOLUTION / view.getResolution()),
      9
    );

    viewport.setZoom(5);

    expect(view.getResolution()).toBeCloseTo(MAX_RESOLUTION / 2 ** 5, 9);
    expect(viewport.getZoom()).toBeCloseTo(5, 9);
    expect(zoomPanOf(viewport).zoom).toBeCloseTo(
      fitResolution(0.4) / (MAX_RESOLUTION / 2 ** 5),
      6
    );
  });
});
