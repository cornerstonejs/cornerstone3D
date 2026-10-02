import SplineROITool from '../src/tools/annotation/SplineROITool';
import LivewireContourTool from '../src/tools/annotation/LivewireContourTool';
import PlanarFreehandROITool from '../src/tools/annotation/PlanarFreehandROITool';
import { getCalibratedLengthUnitsAndScale } from '../src/utilities/getCalibratedUnits';

/**
 * Area of the closed contour tools on calibrated images.
 *
 * The viewport maps one canvas pixel to one world unit, so a contour's canvas
 * area is its area in world units. On an ultrasound image the world unit is the
 * image pixel, and the area has to be converted by the region's physical delta.
 */

const mockEnabledElement = {};

jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  getEnabledElement: () => mockEnabledElement,
}));

const targetId = 'imageId:test';

/** An ultrasound region covering the image at 0.01 cm per pixel. */
const US_REGION = {
  regionLocationMinX0: 0,
  regionLocationMaxX1: 500,
  regionLocationMinY0: 0,
  regionLocationMaxY1: 500,
  regionDataType: 1,
  physicalUnitsXDirection: 3,
  physicalUnitsYDirection: 3,
  physicalDeltaX: 0.01,
  physicalDeltaY: 0.01,
};

const CASES = [
  {
    name: 'an ultrasound region',
    spacing: [1, 1, 1],
    hasPixelSpacing: false,
    calibration: { sequenceOfUltrasoundRegions: [US_REGION] },
    size: 100,
    area: 1,
    areaUnit: 'cm\xb2 US Region',
  },
  {
    name: 'pixel spacing',
    spacing: [0.5, 0.5, 1],
    hasPixelSpacing: true,
    size: 10,
    area: 100,
    areaUnit: 'mm\xb2',
  },
  {
    name: 'no calibration',
    spacing: [1, 1, 1],
    hasPixelSpacing: false,
    size: 20,
    area: 400,
    areaUnit: 'px\xb2',
  },
  {
    name: 'an image without spacing',
    hasPixelSpacing: false,
    calibration: { sequenceOfUltrasoundRegions: [US_REGION] },
    size: 100,
    area: 1,
    areaUnit: 'cm\xb2 US Region',
  },
];

function createImage({ spacing, hasPixelSpacing, calibration }) {
  const [sx, sy] = spacing ?? [1, 1];
  return {
    spacing,
    hasPixelSpacing,
    calibration,
    metadata: { Modality: 'US' },
    imageData: {
      worldToIndex: ([x, y, z]) => [x / sx, y / sy, z],
    },
  };
}

/** A square of side `size` world units, offset from the origin. */
function createSquare(size) {
  return [
    [10, 10, 0],
    [10 + size, 10, 0],
    [10 + size, 10 + size, 0],
    [10, 10 + size, 0],
  ];
}

const viewport = {
  worldToCanvas: ([x, y]) => [x, y],
  canvasToWorld: ([x, y]) => [x, y, 0],
};

describe('Contour tool area calibration', () => {
  beforeEach(() => {
    mockEnabledElement.viewport = viewport;
  });

  for (const Tool of [SplineROITool, LivewireContourTool]) {
    describe(Tool.toolName, () => {
      for (const testCase of CASES) {
        it(`calculates the area on ${testCase.name}`, () => {
          const tool = new Tool();
          tool.configuration.calculateStats = true;
          tool.getTargetImageData = () => createImage(testCase);
          const annotation = {
            invalidated: false,
            data: {
              contour: { closed: true, polyline: createSquare(testCase.size) },
              cachedStats: { [targetId]: {} },
            },
          };

          tool._calculateCachedStats(annotation, {});

          const { area, areaUnit } = annotation.data.cachedStats[targetId];
          expect(area).toBeCloseTo(testCase.area);
          expect(areaUnit).toBe(testCase.areaUnit);
        });
      }
    });
  }

  describe(PlanarFreehandROITool.toolName, () => {
    // updateClosedCachedStats reads a free `closed` variable for the
    // perimeter, which in a browser resolves to window.closed.
    beforeAll(() => {
      globalThis.closed = false;
    });

    for (const testCase of CASES) {
      it(`calculates the area on ${testCase.name}`, () => {
        const tool = new PlanarFreehandROITool();
        tool.sampleVoxelsInContour = () => [];
        tool.configuration.statsCalculator = {
          getStatistics: () => ({ array: [] }),
        };
        const image = createImage(testCase);
        const points = createSquare(testCase.size);
        const handles = [points[0], points[2]].map(
          image.imageData.worldToIndex
        );
        const cachedStats = {};

        tool.updateClosedCachedStats({
          points,
          image,
          imageData: image.imageData,
          metadata: image.metadata,
          cachedStats,
          targetId,
          canvasCoordinates: points.map(viewport.worldToCanvas),
          calibratedScale: getCalibratedLengthUnitsAndScale(image, handles),
          deltaInX: 1,
          deltaInY: 1,
        });

        const { area, areaUnit } = cachedStats[targetId];
        expect(area).toBeCloseTo(testCase.area);
        expect(areaUnit).toBe(testCase.areaUnit);
      });
    }
  });
});
