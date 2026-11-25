jest.mock('../../../../../drawingSvg', () => ({
  drawCircle: jest.fn(),
  drawPath: jest.fn(),
}));

import type { Types } from '@cornerstonejs/core';

import { drawCircle, drawPath } from '../../../../../drawingSvg';
import StrategyCallbacks from '../../../../../enums/StrategyCallbacks';
import circularCursor from '../circularCursor';

const drawCircleMock = drawCircle as jest.Mock;
const drawPathMock = drawPath as jest.Mock;

const renderCursor = circularCursor[StrategyCallbacks.RenderCursor];

type RenderCursorArgs = Parameters<typeof renderCursor>;

const CANVAS_ORIGIN: Types.Point2 = [100, 100];
const PIXELS_PER_MM = 2;
const BRUSH_RADIUS_MM = 10;
const svgDrawingHelper = {} as RenderCursorArgs[2];

/**
 * Fake viewport looking down -z with viewUp = +y and viewRight = +x. The
 * aspect ratio scales the canvas axes the same way the stretched camera
 * projection does.
 */
function createViewport(aspectRatio: Types.Point2) {
  const [sx, sy] = aspectRatio;

  return {
    getRenderingEngine: () => ({}),
    worldToCanvas: ([x, y]: Types.Point3): Types.Point2 => [
      CANVAS_ORIGIN[0] + x * PIXELS_PER_MM * sx,
      CANVAS_ORIGIN[1] - y * PIXELS_PER_MM * sy,
    ],
  };
}

/** Cursor handle points in the order bottom, top, left, right. */
function createCirclePoints(
  [cx, cy]: [number, number],
  radius: number
): Types.Point3[] {
  return [
    [cx, cy - radius, 0],
    [cx, cy + radius, 0],
    [cx - radius, cy, 0],
    [cx + radius, cy, 0],
  ];
}

function render(aspectRatio: Types.Point2, points: Types.Point3[]) {
  const enabledElement = {
    viewport: createViewport(aspectRatio),
  } as unknown as RenderCursorArgs[0];
  const operationData = {
    configuration: {},
    hoverData: {
      brushCursor: {
        metadata: { brushCursorUID: 'cursor', segmentColor: [255, 0, 0] },
        data: { handles: { points } },
      },
    },
  } as unknown as RenderCursorArgs[1];

  renderCursor.call(
    { centerSegmentIndexInfo: { segmentIndex: 1 } },
    enabledElement,
    operationData,
    svgDrawingHelper
  );
}

describe('circularCursor renderCursor', () => {
  beforeEach(() => {
    drawCircleMock.mockClear();
    drawPathMock.mockClear();
  });

  it.each([[[1, 1]], [[1, 2]], [[2, 1]], [[1, 3]]] as Array<[Types.Point2]>)(
    'keeps the cursor at the unstretched radius for aspect ratio %j',
    (aspectRatio) => {
      render(aspectRatio, createCirclePoints([0, 0], BRUSH_RADIUS_MM));

      expect(drawCircleMock).toHaveBeenCalledTimes(1);
      expect(drawCircleMock).toHaveBeenCalledWith(
        svgDrawingHelper,
        'cursor',
        'current-circle',
        CANVAS_ORIGIN,
        BRUSH_RADIUS_MM * PIXELS_PER_MM,
        expect.any(Object),
        'brush-cursor'
      );
    }
  );

  it('draws the cursor at the latest circle of a lazy edit stroke', () => {
    render(
      [1, 2],
      [
        ...createCirclePoints([0, 0], BRUSH_RADIUS_MM),
        ...createCirclePoints([10, 0], BRUSH_RADIUS_MM),
      ]
    );

    expect(drawPathMock).toHaveBeenCalledWith(
      svgDrawingHelper,
      'cursor',
      'stroke-preview',
      [
        [100, 100],
        [120, 100],
      ],
      expect.objectContaining({
        lineWidth: 2 * BRUSH_RADIUS_MM * PIXELS_PER_MM,
      })
    );
    expect(drawCircleMock).toHaveBeenCalledWith(
      svgDrawingHelper,
      'cursor',
      'current-circle',
      [120, 100],
      BRUSH_RADIUS_MM * PIXELS_PER_MM,
      expect.any(Object),
      'brush-cursor'
    );
  });
});
