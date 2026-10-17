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

function createImage(calibration = undefined) {
  return {
    calibration,
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
    // The view plane normals of the default axial, sagittal and coronal cameras
    const AXIAL = [0, 0, -1];
    const SAGITTAL = [1, 0, 0];
    const CORONAL = [0, -1, 0];

    function measureHeight(points, metadata, viewportCamera = {}) {
      const tool = new HeightTool();
      tool.getTargetImageData = () => createImage();
      const annotation = {
        data: { handles: { points }, cachedStats: { target: {} } },
        invalidated: false,
        metadata,
      };
      tool._calculateCachedStats(annotation, null, {
        viewport: {
          ...createViewport(),
          getViewReference: () => ({}),
          ...viewportCamera,
        },
      });
      return annotation.data.cachedStats.target;
    }

    // A legacy viewport has getCamera; a generic (next) viewport has none and
    // resolves its camera from the view it displays
    const legacyCamera = (viewPlaneNormal) => ({
      getCamera: () => ({ viewPlaneNormal }),
    });
    const genericCamera = (viewPlaneNormal) => ({
      setDisplaySets: () => undefined,
      setDisplaySetPresentation: () => undefined,
      setViewState: () => undefined,
      getResolvedView: () => ({ toICamera: () => ({ viewPlaneNormal }) }),
    });

    it('reports the vertical extent in mm on an axial slice', () => {
      const { height, unit } = measureHeight(
        [
          [10, 10, 4],
          [15, 30, 4],
        ],
        { viewPlaneNormal: AXIAL }
      );

      expect(unit).toBe('mm');
      expect(height).toBeCloseTo(20);
    });

    // A height drawn straight up or down keeps the other in-plane coordinate,
    // so the orientation cannot be read from which coordinates stay the same.
    it.each([
      ['an axial', AXIAL, [10, 30, 4]],
      ['a sagittal', SAGITTAL, [10, 10, 24]],
      ['a coronal', CORONAL, [10, 10, 24]],
    ])(
      'reports a height drawn straight up on %s slice',
      (_name, viewPlaneNormal, end) => {
        const { height } = measureHeight([[10, 10, 4], end], {
          viewPlaneNormal,
        });

        expect(height).toBeCloseTo(20);
      }
    );

    it.each([
      ['sagittal', SAGITTAL, [10, 25, 24]],
      ['coronal', CORONAL, [20, 10, 24]],
    ])(
      'reports the vertical extent in mm on a %s slice, across the slice spacing',
      (_name, viewPlaneNormal, end) => {
        const { height } = measureHeight([[10, 10, 4], end], {
          viewPlaneNormal,
        });

        expect(height).toBeCloseTo(20);
      }
    );

    it('reports no height on an oblique plane', () => {
      const { height } = measureHeight(
        [
          [10, 10, 4],
          [20, 30, 24],
        ],
        { viewPlaneNormal: [2 / Math.sqrt(5), 0, -1 / Math.sqrt(5)] }
      );

      expect(height).toBeUndefined();
    });

    it('reads a normal with rounding noise as an axial slice', () => {
      const { height } = measureHeight(
        [
          [10, 10, 4],
          [10, 30, 4],
        ],
        { viewPlaneNormal: [0, 1e-9, -1 + 1e-12] }
      );

      expect(height).toBeCloseTo(20);
    });

    it.each([
      ['a legacy', legacyCamera],
      ['a generic', genericCamera],
    ])(
      'uses the camera normal of %s viewport when the annotation has none',
      (_name, viewportCamera) => {
        const { height } = measureHeight(
          [
            [10, 10, 4],
            [10, 30, 4],
          ],
          {},
          viewportCamera(AXIAL)
        );

        expect(height).toBeCloseTo(20);
      }
    );
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

  // The radius is measured in index space, where the per-axis scales already
  // square up the pixels, so a calibration aspect does not change the area.
  it.each([
    ['no calibration', undefined],
    ['a calibration aspect', { aspect: 2 }],
  ])(
    'CircleROIStartEndThresholdTool reports the area in mm² with %s',
    (_name, calibration) => {
      const tool = new CircleROIStartEndThresholdTool();
      tool.configuration.statsCalculator = createStatsCalculator();
      tool.getTargetImageData = () => createImage(calibration);
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
    }
  );
});
