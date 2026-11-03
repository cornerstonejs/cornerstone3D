import { describe, it, expect, jest } from '@jest/globals';
import * as cornerstone from '@cornerstonejs/core';
import PlanarFreehandROITool from '../src/tools/annotation/PlanarFreehandROITool';
import SplineROITool from '../src/tools/annotation/SplineROITool';
import LivewireContourTool from '../src/tools/annotation/LivewireContourTool';

jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  getEnabledElement: jest.fn(),
}));

jest.mock('../src/utilities/viewport/isViewportPreScaled', () => ({
  isViewportPreScaled: () => false,
}));

// An ultrasound frame with no pixel spacing, so world units are pixels, and
// one tissue region in cm: 0.01 cm per pixel across and 0.02 cm down.
function createUltrasoundImage() {
  return {
    calibration: {
      sequenceOfUltrasoundRegions: [
        {
          regionLocationMinX0: 0,
          regionLocationMaxX1: 511,
          regionLocationMinY0: 0,
          regionLocationMaxY1: 511,
          regionDataType: 1,
          physicalDeltaX: 0.01,
          physicalDeltaY: 0.02,
          physicalUnitsXDirection: 3,
          physicalUnitsYDirection: 3,
        },
      ],
    },
    hasPixelSpacing: false,
    spacing: [1, 1, 1],
    dimensions: [512, 512, 1],
    imageData: { worldToIndex: (point) => [...point] },
    metadata: { Modality: 'US' },
    voxelManager: {},
  };
}

// A 100 x 100 pixel square: 1 cm across and 2 cm down, 2 cm².
const square = [
  [100, 100, 0],
  [200, 100, 0],
  [200, 200, 0],
  [100, 200, 0],
];

function createViewport() {
  return {
    element: document.createElement('div'),
    worldToCanvas: ([x, y]) => [x, y],
    canvasToWorld: ([x, y]) => [x, y, 0],
  };
}

function createAnnotation() {
  return {
    data: {
      contour: { polyline: square, closed: true },
      cachedStats: { target: {} },
    },
    metadata: {},
    invalidated: false,
  };
}

function createTool(ToolClass) {
  const tool = new ToolClass();
  tool.configuration.calculateStats = true;
  tool.configuration.statsCalculator = {
    getStatistics: jest.fn(() => ({ array: [] })),
    statsCallback: jest.fn(),
  };
  tool.getTargetImageData = () => createUltrasoundImage();
  return tool;
}

describe('contour areas on an ultrasound image calibrated by region', () => {
  it('PlanarFreehandROITool reports the area in the region units', () => {
    const tool = createTool(PlanarFreehandROITool);
    jest.spyOn(tool, 'sampleVoxelsInContour').mockReturnValue([]);
    const annotation = createAnnotation();
    const viewport = createViewport();

    tool._calculateCachedStats(annotation, viewport, null, { viewport });

    const { area, areaUnit, perimeter, unit } =
      annotation.data.cachedStats.target;
    expect(areaUnit).toBe('cm² US Region');
    expect(area).toBeCloseTo(2);
    // all four sides, including the one from the last point to the first
    expect(unit).toBe('cm US Region');
    expect(perimeter).toBeCloseTo(6);
  });

  it.each([
    ['SplineROITool', SplineROITool],
    ['LivewireContourTool', LivewireContourTool],
  ])('%s reports the area in the region units', (_name, ToolClass) => {
    const tool = createTool(ToolClass);
    const annotation = createAnnotation();
    const viewport = createViewport();
    cornerstone.getEnabledElement.mockReturnValue({ viewport });

    tool._calculateCachedStats(annotation, viewport.element);

    const { area, areaUnit } = annotation.data.cachedStats.target;
    expect(areaUnit).toBe('cm² US Region');
    expect(area).toBeCloseTo(2);
  });
});
