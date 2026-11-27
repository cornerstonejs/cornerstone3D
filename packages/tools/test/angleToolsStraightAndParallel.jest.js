import { describe, it, expect } from '@jest/globals';
import AngleTool from '../src/tools/annotation/AngleTool';
import CobbAngleTool from '../src/tools/annotation/CobbAngleTool';

// The world coordinates used below are on the z = 0 plane and the viewport
// maps world to canvas by dropping z, so the canvas and world geometry agree.
const viewport = {
  element: {},
  worldToCanvas: (point) => [point[0], point[1]],
  canvasToWorld: (point) => [point[0], point[1], 0],
};
const enabledElement = { viewport };

const image = {
  dimensions: [100, 100, 1],
  imageData: {
    worldToIndex: (point) => [...point],
  },
};

function createAnnotation(points) {
  return {
    data: {
      handles: { points },
      cachedStats: { 'imageId:test': {} },
    },
    invalidated: false,
    metadata: {},
  };
}

describe('angle tools on straight and parallel lines', () => {
  // The cosine of these vectors rounds to just past -1 or 1
  // (-1.0000000000000004 and 1.0000000000000004), so Math.acos used to
  // return NaN.
  it('AngleTool reports 180 degrees for three collinear points', () => {
    const tool = new AngleTool();
    tool.getTargetImageData = () => image;
    const annotation = createAnnotation([
      [0, 0, 0],
      [1, 6, 0],
      [2, 12, 0],
    ]);

    tool._calculateCachedStats(annotation, null, enabledElement);

    const { angle } = annotation.data.cachedStats['imageId:test'];
    expect(angle).toBeCloseTo(180, 10);
    expect(
      tool.configuration.getTextLines(annotation.data, 'imageId:test')
    ).toEqual([`180 ${String.fromCharCode(176)}`]);
  });

  it('AngleTool still reports an incomplete angle for a zero length side', () => {
    const tool = new AngleTool();
    tool.getTargetImageData = () => image;
    const annotation = createAnnotation([
      [1, 6, 0],
      [1, 6, 0],
      [2, 12, 0],
    ]);

    tool._calculateCachedStats(annotation, null, enabledElement);

    expect(annotation.data.cachedStats['imageId:test'].angle).toBe(
      'Incomplete Angle'
    );
  });

  it('CobbAngleTool reports 0 degrees for two parallel lines', () => {
    const tool = new CobbAngleTool();
    const annotation = createAnnotation([
      [0, 0, 0],
      [1, 6, 0],
      [0, 1, 0],
      [1, 7, 0],
    ]);

    tool._calculateCachedStats(annotation, null, enabledElement);

    const { angle } = annotation.data.cachedStats['imageId:test'];
    expect(angle).toBeCloseTo(0, 5);
    expect(
      tool.configuration.getTextLines(annotation.data, 'imageId:test')
    ).toEqual([`0.00 ${String.fromCharCode(176)}`]);
  });

  it('CobbAngleTool reports 180 degrees for two lines end to end on one line', () => {
    const tool = new CobbAngleTool();
    const annotation = createAnnotation([
      [0, 0, 0],
      [1, 6, 0],
      [2, 12, 0],
      [3, 18, 0],
    ]);

    tool._calculateCachedStats(annotation, null, enabledElement);

    expect(annotation.data.cachedStats['imageId:test'].angle).toBeCloseTo(
      180,
      10
    );
  });
});
