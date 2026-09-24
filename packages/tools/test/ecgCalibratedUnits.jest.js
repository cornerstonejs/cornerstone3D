import {
  getCalibratedLengthUnitsAndScale,
  getCalibratedProbeUnitsAndValue,
} from '../src/utilities/getCalibratedUnits';

const SAMPLING_FREQUENCY = 500;
const PHYSICAL_DELTA_X = 1 / SAMPLING_FREQUENCY; // seconds for each sample
const PHYSICAL_DELTA_Y = 0.001; // millivolts for each raw unit
const NUMBER_OF_SAMPLES = 5000;
const AMPLITUDE_INDEX_SIZE = 65536;

function makeECGImage(physicalUnitsYDirection = -1) {
  return {
    hasPixelSpacing: false,
    spacing: [1, 1, 1],
    calibration: {
      sequenceOfUltrasoundRegions: [
        {
          regionLocationMinX0: 0,
          regionLocationMaxX1: NUMBER_OF_SAMPLES,
          regionLocationMinY0: 0,
          regionLocationMaxY1: AMPLITUDE_INDEX_SIZE - 1,
          referencePixelX0: 0,
          referencePixelY0: AMPLITUDE_INDEX_SIZE / 2,
          physicalDeltaX: PHYSICAL_DELTA_X,
          physicalDeltaY: PHYSICAL_DELTA_Y,
          physicalUnitsXDirection: 4,
          physicalUnitsYDirection,
          regionDataType: 1,
        },
      ],
    },
  };
}

// A horizontal annotation: 500 samples apart, same amplitude.
const HORIZONTAL_HANDLES = [
  [1000, 32768],
  [1500, 32768],
];

// A vertical annotation: same sample, 20000 amplitude units apart. That is a
// larger fraction of the amplitude axis than 10 samples is of the time axis.
const VERTICAL_HANDLES = [
  [1000, 22768],
  [1010, 42768],
];

describe('getCalibratedUnits for an ECG region', () => {
  describe('the area unit', () => {
    it('reports a time multiplied by an amplitude, not a squared unit', () => {
      const { areaUnit } = getCalibratedLengthUnitsAndScale(
        makeECGImage(),
        HORIZONTAL_HANDLES
      );

      expect(areaUnit).toBe('ms\xb7mV ECG Region');
      expect(areaUnit).not.toContain('ms\xb2');
      expect(areaUnit).not.toContain('px');
    });

    it('reports the same area unit for a region stored with the old -2 code', () => {
      const { areaUnit } = getCalibratedLengthUnitsAndScale(
        makeECGImage(-2),
        HORIZONTAL_HANDLES
      );

      expect(areaUnit).toBe('ms\xb7mV ECG Region');
    });
  });

  describe('the length unit and scale', () => {
    it('reports milliseconds for a horizontal annotation', () => {
      const { unit, scale, scaleY } = getCalibratedLengthUnitsAndScale(
        makeECGImage(),
        HORIZONTAL_HANDLES
      );

      expect(unit).toBe('ms ECG Region');
      // 500 samples at 500 Hz is 1 s, which is 1000 ms. The caller divides the
      // index distance by `scale`, so 500 / scale must be 1000.
      expect(500 / scale).toBeCloseTo(1000, 6);
      expect(scaleY).toBeCloseTo(1 / PHYSICAL_DELTA_Y, 6);
    });

    it('reports millivolts for a vertical annotation', () => {
      const { unit } = getCalibratedLengthUnitsAndScale(
        makeECGImage(),
        VERTICAL_HANDLES
      );

      expect(unit).toBe('mV ECG Region');
    });

    it('keeps the X scale on the X axis for a vertical annotation', () => {
      const horizontal = getCalibratedLengthUnitsAndScale(
        makeECGImage(),
        HORIZONTAL_HANDLES
      );
      const vertical = getCalibratedLengthUnitsAndScale(
        makeECGImage(),
        VERTICAL_HANDLES
      );

      // The defect wrote `scale = scaleY` in the vertical branch, and
      // `calculateLengthInIndex` applies `scale` to the X component. The two
      // scales must not depend on the direction of the annotation.
      expect(vertical.scale).toBeCloseTo(horizontal.scale, 6);
      expect(vertical.scaleY).toBeCloseTo(horizontal.scaleY, 6);
    });

    it('does not decide the axis by comparing seconds against millivolts', () => {
      // 10 samples is 0.02 s. 30 amplitude units is 0.03 mV. The old test
      // compared 0.03 against 0.02 and called this vertical, although the
      // annotation covers a far larger fraction of the time axis.
      const handles = [
        [1000, 32768],
        [1010, 32798],
      ];
      const { unit } = getCalibratedLengthUnitsAndScale(
        makeECGImage(),
        handles
      );

      expect(unit).toBe('ms ECG Region');
    });
  });

  describe('the probe values', () => {
    it('reports milliseconds and millivolts', () => {
      const { units, values, calibrationType } =
        getCalibratedProbeUnitsAndValue(makeECGImage(), [[1000, 42768]]);

      expect(calibrationType).toBe('ECG Region');
      expect(units).toEqual(['ms', 'mV']);
      // 1000 samples at 500 Hz is 2 s, which is 2000 ms.
      expect(values[0]).toBeCloseTo(2000, 6);
      // 42768 - 32768 = 10000 raw units, which is 10 mV.
      expect(values[1]).toBeCloseTo(10, 6);
    });

    it('reports the same values for a region stored with the old -2 code', () => {
      const { units, values } = getCalibratedProbeUnitsAndValue(
        makeECGImage(-2),
        [[1000, 42768]]
      );

      expect(units).toEqual(['ms', 'mV']);
      expect(values[0]).toBeCloseTo(2000, 6);
      expect(values[1]).toBeCloseTo(10, 6);
    });
  });
});
