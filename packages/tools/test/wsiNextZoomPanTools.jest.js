jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');

  return {
    ...actual,
    getEnabledElement: jest.fn(),
  };
});

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { getEnabledElement, viewportProjection } from '@cornerstonejs/core';
import WSIViewport from '../../core/src/RenderingEngine/GenericViewport/WSI/WSIViewport';
import {
  COLUMNS,
  HEIGHT,
  ROWS,
  WIDTH,
  mountNext,
  unmount,
} from '../../core/test/utils/wsiStandIn';
import PanTool from '../src/tools/PanTool';
import ZoomTool from '../src/tools/ZoomTool';
import BaseTool from '../src/tools/base/BaseTool';

/**
 * The map resolution at which the microscopy viewer fits the slide of the
 * stand-in, turned by 0.4, to the canvas of 400 by 300 pixels: the larger
 * ratio of the turned extent of 40000 by 30000 pixels to the canvas.
 */
const FIT_RESOLUTION = Math.max(
  (COLUMNS * Math.cos(0.4) + ROWS * Math.sin(0.4)) / WIDTH,
  (COLUMNS * Math.sin(0.4) + ROWS * Math.cos(0.4)) / HEIGHT
);

/** The zoom and the pan of the viewport from the projection service. */
function zoomPanOf(viewport) {
  return viewportProjection.getPresentation(viewport, {
    selector: { zoom: true, pan: true },
  });
}

function expectClose(actual, expected, precision = 3) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], precision)
  );
}

describe('Zoom and pan tools on a direct next whole slide viewport', () => {
  let mounted;
  let viewport;
  let element;

  beforeEach(async () => {
    mounted = await mountNext(WSIViewport, 0.4);
    ({ viewport, element } = mounted);
    getEnabledElement.mockReturnValue({ viewport, renderingEngineId: 're' });
  });

  afterEach(() => {
    unmount(mounted);
  });

  /** One turn of the wheel over a canvas point, towards a larger zoom. */
  function wheel(tool, canvasPoint, zoomIn = true) {
    tool._zoom({
      detail: {
        element,
        points: {
          page: canvasPoint,
          client: canvasPoint,
          canvas: canvasPoint,
          world: viewport.canvasToWorld(canvasPoint),
        },
        wheel: { direction: zoomIn ? -1 : 1 },
      },
    });
  }

  it('has no legacy camera and no pan members, so the tools go through the projection service', () => {
    expect(viewport.getCamera).toBeUndefined();
    expect(viewport.getPan).toBeUndefined();
    expect(viewport.setPan).toBeUndefined();
    expect(zoomPanOf(viewport).zoom).toBeCloseTo(
      FIT_RESOLUTION / mounted.view.getResolution(),
      6
    );
    expect(zoomPanOf(viewport).pan.length).toBe(2);
  });

  it('moves the picture with the mouse of the pan tool, also on a turned slide', () => {
    const tool = new PanTool();

    [0, 90, 30].forEach((rotation) => {
      viewport.setViewState({ rotation });

      const from = [150, 120];
      const delta = [35, -25];
      const world = viewport.canvasToWorld(from);

      tool.mouseDragCallback({
        detail: {
          element,
          deltaPoints: { world: [1, 1, 0], canvas: delta },
        },
      });

      expectClose(viewport.worldToCanvas(world), [
        from[0] + delta[0],
        from[1] + delta[1],
      ]);
    });
  });

  it('keeps the zoom of the wheel inside the limits of the zoom tool, about the mouse', () => {
    const zoomAtMount = zoomPanOf(viewport).zoom;
    const tool = new ZoomTool({
      configuration: {
        minZoomScale: zoomAtMount / Math.SQRT2,
        maxZoomScale: zoomAtMount * Math.SQRT2,
      },
    });
    const mouse = [310, 80];
    const underMouse = viewport.canvasToWorld(mouse);

    wheel(tool, mouse);

    expect(zoomPanOf(viewport).zoom).toBeGreaterThan(zoomAtMount);
    expect(zoomPanOf(viewport).zoom).toBeLessThan(zoomAtMount * Math.SQRT2);
    expectClose(viewport.worldToCanvas(underMouse), mouse);

    for (let step = 0; step < 10; step++) {
      wheel(tool, mouse);
    }

    expect(zoomPanOf(viewport).zoom).toBeCloseTo(zoomAtMount * Math.SQRT2, 6);
    expectClose(viewport.worldToCanvas(underMouse), mouse);

    for (let step = 0; step < 20; step++) {
      wheel(tool, mouse, false);
    }

    expect(zoomPanOf(viewport).zoom).toBeCloseTo(zoomAtMount / Math.SQRT2, 6);
    expectClose(viewport.worldToCanvas(underMouse), mouse);
  });

  it('zooms about the centre of the canvas with zoomToCenter', () => {
    const tool = new ZoomTool({ configuration: { zoomToCenter: true } });
    const centre = [WIDTH / 2, HEIGHT / 2];
    const atCentre = viewport.canvasToWorld(centre);
    const zoomAtMount = zoomPanOf(viewport).zoom;

    wheel(tool, [310, 80]);

    expect(zoomPanOf(viewport).zoom).toBeGreaterThan(zoomAtMount);
    expectClose(viewport.worldToCanvas(atCentre), centre);
  });

  it('zooms by a drag and by a pinch, and pans with the pinch', () => {
    const tool = new ZoomTool({
      configuration: { minZoomScale: 0.5, maxZoomScale: 2000 },
    });
    const start = [200, 150];
    const zoomAtMount = zoomPanOf(viewport).zoom;

    tool.mouseDragCallback({
      detail: {
        element,
        deltaPoints: { world: [1, 1, 0], canvas: [0, 12] },
        startPoints: { canvas: start },
      },
    });

    const zoomAfterDrag = zoomPanOf(viewport).zoom;

    expect(zoomAfterDrag).toBeCloseTo(zoomAtMount / (1 - (12 * 5) / HEIGHT), 6);

    const world = viewport.canvasToWorld(start);

    tool.touchDragCallback({
      detail: {
        element,
        currentPointsList: [{}, {}],
        currentPoints: { world },
        deltaDistance: { canvas: 6 },
        deltaPoints: { world: [1, 1, 0], canvas: [10, -4] },
        startPoints: { canvas: start },
      },
    });

    expect(zoomPanOf(viewport).zoom).toBeCloseTo(
      zoomAfterDrag / (1 - (6 * 5) / HEIGHT),
      6
    );
    expectClose(viewport.worldToCanvas(world), [start[0] + 10, start[1] - 4]);
  });

  it('changes the size of the slide by the same factor for each step as on every family, and as the legacy adapter does', () => {
    const tool = new ZoomTool();
    const { view } = mounted;
    const mouse = [310, 80];
    const underMouse = viewport.canvasToWorld(mouse);

    expect(view.getResolution()).toBeCloseTo(4, 9);

    [4.8, 5.76].forEach((resolution) => {
      tool.mouseDragCallback({
        detail: {
          element,
          deltaPoints: { world: [1, 1, 0], canvas: [0, -12] },
          startPoints: { canvas: mouse },
        },
      });

      expect(view.getResolution()).toBeCloseTo(resolution, 6);
      expectClose(viewport.worldToCanvas(underMouse), mouse);
    });

    view.setResolution(4);

    [(4 * 11) / 12, (4 * 11 * 11) / 144].forEach((resolution) => {
      wheel(tool, mouse);

      expect(view.getResolution()).toBeCloseTo(resolution, 6);
    });
  });

  it('restores the zoom and the pan of a zoom and pan memo, and brings the change back on a second restore', () => {
    const atMount = zoomPanOf(viewport);
    const memo = BaseTool.createZoomPanMemo(viewport);

    viewport.setViewState(
      viewportProjection.withPresentation(viewport, {
        zoom: atMount.zoom + 1,
        pan: [12, -8],
      })
    );

    const changed = zoomPanOf(viewport);

    expect(changed.zoom).toBeCloseTo(atMount.zoom + 1, 6);
    expectClose(changed.pan, [12, -8]);

    memo.restoreMemo();

    expect(zoomPanOf(viewport).zoom).toBeCloseTo(atMount.zoom, 6);
    expectClose(zoomPanOf(viewport).pan, atMount.pan);

    memo.restoreMemo();

    expect(zoomPanOf(viewport).zoom).toBeCloseTo(changed.zoom, 6);
    expectClose(zoomPanOf(viewport).pan, changed.pan);
  });
});
