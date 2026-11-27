jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  getEnabledElement: jest.fn(),
}));
jest.mock('../src/utilities/viewportFilters', () => ({
  ...jest.requireActual('../src/utilities/viewportFilters'),
  getViewportIdsWithToolToRender: () => [],
}));
jest.mock('../src/utilities/triggerAnnotationRenderForViewportIds', () =>
  jest.fn()
);
jest.mock('../src/cursors/elementCursor', () => ({
  ...jest.requireActual('../src/cursors/elementCursor'),
  hideElementCursor: jest.fn(),
}));

import { getEnabledElement } from '@cornerstonejs/core';
import EllipticalROITool from '../src/tools/annotation/EllipticalROITool';

/**
 * Dragging a handle resizes the ellipse along the axis under the cursor and
 * keeps the other axis, whatever order the four points are stored in.
 */
describe('Elliptical ROI handle drag', () => {
  // The canvas is the world plane, so x is horizontal and y is vertical.
  const viewport = {
    worldToCanvas: ([x, y]) => [x, y],
    canvasToWorld: ([x, y]) => [x, y, 0],
  };
  const element = document.createElement('div');

  const LEFT = [12, 20, 0];
  const RIGHT = [28, 20, 0];
  const TOP = [20, 16, 0];
  const BOTTOM = [20, 24, 0];

  beforeEach(() => {
    getEnabledElement.mockReturnValue({ viewport });
  });

  function createAnnotation(points) {
    return {
      annotationUID: 'ellipse',
      highlighted: false,
      data: { handles: { points: points.map((p) => [...p]) } },
      metadata: { viewPlaneNormal: [0, 0, 1], viewUp: [0, -1, 0] },
    };
  }

  function event(canvas = [0, 0]) {
    return {
      detail: { element, currentPoints: { canvas } },
      preventDefault: () => undefined,
    };
  }

  function drag(points, pointIndex, toCanvas) {
    const tool = new EllipticalROITool();
    tool._activateModify = () => undefined;
    const annotation = createAnnotation(points);
    const handle = annotation.data.handles.points[pointIndex];

    tool.handleSelectedCallback(event(), annotation, handle);
    tool._dragHandle(event(toCanvas));

    return annotation.data.handles.points;
  }

  function extent(points) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return {
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  it('widens the ellipse when the right handle of [bottom, top, left, right] is dragged out', () => {
    const points = drag([BOTTOM, TOP, LEFT, RIGHT], 3, [32, 20]);

    expect(extent(points)).toEqual({ width: 24, height: 8 });
  });

  it('widens the ellipse when the right handle of [left, right, top, bottom] is dragged out', () => {
    const points = drag([LEFT, RIGHT, TOP, BOTTOM], 1, [32, 20]);

    expect(extent(points)).toEqual({ width: 24, height: 8 });
  });

  it('heightens the ellipse when the bottom handle of [left, right, top, bottom] is dragged out', () => {
    const points = drag([LEFT, RIGHT, TOP, BOTTOM], 3, [20, 26]);

    expect(extent(points)).toEqual({ width: 16, height: 12 });
  });
});
