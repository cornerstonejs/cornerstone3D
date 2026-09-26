import { describe, it, expect, jest } from '@jest/globals';
import HeightTool from '../src/tools/annotation/HeightTool';
import CircleROIStartEndThresholdTool from '../src/tools/segmentation/CircleROIStartEndThresholdTool';
import RectangleROIStartEndThresholdTool from '../src/tools/segmentation/RectangleROIStartEndThresholdTool';

jest.mock('../src/utilities/viewport/isViewportPreScaled', () => ({
  isViewportPreScaled: () => false,
}));

// A CT-like volume: 0.5 mm pixels in plane and 2 mm between slices, with the
// world origin at index 0. The calibration scale of such an image is
// 1 / spacing (index units per mm), so a measurement that divides a world
// distance by it is off by the spacing.
const spacing = [0.5, 0.5, 2];

function createImage() {
  return {
    dimensions: [512, 512, 100],
    hasPixelSpacing: true,
    spacing,
    imageData: {
      worldToIndex: (point) =>
        point.map((value, axis) => value / spacing[axis]),
    },
    metadata: { Modality: 'CT' },
  };
}

function createViewport() {
  return {
    element: document.createElement('div'),
    worldToCanvas: ([x, y]) => [x, y],
    canvasToWorld: ([x, y]) => [x, y, 4],
  };
}

function createStatsCalculator() {
  return {
    getStatistics: jest.fn(() => ({ array: [] })),
    statsCallback: jest.fn(),
  };
}

describe('measurements of world distances on an image with non-unit spacing', () => {
  describe('HeightTool', () => {
    function measureHeight(points) {
      const tool = new HeightTool();
      tool.getTargetImageData = () => createImage();
      const annotation = {
        data: { handles: { points }, cachedStats: { target: {} } },
        invalidated: false,
        metadata: {},
      };
      tool._calculateCachedStats(annotation, null, {
        viewport: createViewport(),
      });
      return annotation.data.cachedStats.target;
    }

    it('reports the vertical extent in mm on an axial slice', () => {
      const { height, unit } = measureHeight([
        [10, 10, 4],
        [15, 30, 4],
      ]);

      expect(unit).toBe('mm');
      expect(height).toBeCloseTo(20);
    });

    it('reports the vertical extent in mm on a sagittal slice, across the slice spacing', () => {
      const { height } = measureHeight([
        [10, 10, 4],
        [10, 30, 24],
      ]);

      expect(height).toBeCloseTo(20);
    });

    it('reports no height on an oblique plane', () => {
      const { height } = measureHeight([
        [10, 10, 4],
        [20, 30, 24],
      ]);

      expect(height).toBeUndefined();
    });
  });

  it('RectangleROIStartEndThresholdTool reports the area in mm²', () => {
    const tool = new RectangleROIStartEndThresholdTool();
    tool.configuration.statsCalculator = createStatsCalculator();
    tool.getTargetImageData = () => createImage();
    // 20 mm wide and 10 mm high
    const annotation = {
      data: {
        handles: {
          points: [
            [10, 10, 4],
            [30, 10, 4],
            [10, 20, 4],
            [30, 20, 4],
          ],
        },
        cachedStats: { projectionPoints: [] },
      },
      metadata: { viewPlaneNormal: [0, 0, 1], viewUp: [0, -1, 0] },
    };

    tool._computePointsInsideVolume(annotation, 'volumeId:ct', undefined, {
      viewport: createViewport(),
    });

    const { area, areaUnit } = annotation.data.cachedStats.statistics;
    expect(areaUnit).toBe('mm²');
    expect(area).toBeCloseTo(200);
  });

  it('CircleROIStartEndThresholdTool reports the area in mm²', () => {
    const tool = new CircleROIStartEndThresholdTool();
    tool.configuration.statsCalculator = createStatsCalculator();
    tool.getTargetImageData = () => createImage();
    // centre and a point on the circle, 10 mm apart
    const annotation = {
      data: {
        handles: {
          points: [
            [20, 20, 4],
            [30, 20, 4],
          ],
        },
        cachedStats: { projectionPoints: [] },
      },
      metadata: { viewPlaneNormal: [0, 0, 1], viewUp: [0, -1, 0] },
    };

    tool._computePointsInsideVolume(annotation, undefined, 'volumeId:ct', {
      viewport: createViewport(),
    });

    const { area, areaUnit } = annotation.data.cachedStats.statistics;
    expect(areaUnit).toBe('mm²');
    expect(area).toBeCloseTo(Math.PI * 100);
  });
});
