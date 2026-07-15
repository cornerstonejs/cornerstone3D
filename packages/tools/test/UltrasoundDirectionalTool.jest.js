import UltrasoundDirectionalTool from '../src/tools/annotation/UltrasoundDirectionalTool';

describe('Ultrasound Directional measurements', () => {
  it('uses continuous indices for calibrated endpoint values', () => {
    const tool = new UltrasoundDirectionalTool();
    const targetId = 'imageId:test';
    const image = {
      calibration: {
        sequenceOfUltrasoundRegions: [
          {
            regionDataType: 1,
            regionLocationMinX0: 0,
            regionLocationMaxX1: 100,
            regionLocationMinY0: 0,
            regionLocationMaxY1: 100,
            physicalUnitsXDirection: 4,
            physicalUnitsYDirection: 7,
            physicalDeltaX: 2,
            physicalDeltaY: 3,
          },
        ],
      },
      imageData: {
        worldToIndex: ([x, y, z]) => [x, y, z],
      },
    };
    const annotation = {
      data: {
        cachedStats: { [targetId]: {} },
        handles: {
          points: [
            [0.2, 0.3, 0],
            [10.7, 4.8, 0],
          ],
        },
      },
      invalidated: false,
    };
    const viewport = {
      element: document.createElement('div'),
      worldToCanvas: ([x, y]) => [x, y],
    };

    tool.getTargetImageData = () => image;

    tool._calculateCachedStats(annotation, {}, { viewport });

    const { xValues, yValues, isHorizontal, units, isUnitless } =
      annotation.data.cachedStats[targetId];

    expect(xValues[0]).toBeCloseTo(0.4);
    expect(xValues[1]).toBeCloseTo(21.4);
    expect(yValues[0]).toBeCloseTo(0.9);
    expect(yValues[1]).toBeCloseTo(14.4);
    expect(isHorizontal).toBe(true);
    expect(units).toEqual(['seconds', 'cm/sec']);
    expect(isUnitless).toBe(false);
  });
});
