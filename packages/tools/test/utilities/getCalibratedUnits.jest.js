import { Enums } from '@cornerstonejs/core';
import { getCalibratedLengthUnitsAndScale } from '../../src/utilities/getCalibratedUnits';

const { CalibrationTypes } = Enums;

import { describe, it, expect } from '@jest/globals';

const sequenceOfUltrasoundRegions = [
  {
    regionLocationMinX0: 15,
    regionLocationMaxX1: 20,
    regionLocationMinY0: 15,
    regionLocationMaxY1: 20,
    regionDataType: 1,
    physicalDeltaX: 4,
    physicalDeltaY: 5,
    physicalUnitsXDirection: 4,
    physicalUnitsYDirection: 5,
  },
  {
    regionLocationMinX0: 15,
    regionLocationMaxX1: 50,
    regionLocationMinY0: 15,
    regionLocationMaxY1: 50,
    regionDataType: 1,
    physicalDeltaX: 2,
    physicalDeltaY: 4,
    physicalUnitsXDirection: 3,
    physicalUnitsYDirection: 3,
  },
];

describe('getCalibratedUnits', function () {
  describe('getCalibratedLengthUnitsAndScale', () => {
    it('Should return basic values for uncalibrated non US', () => {
      const image = {};
      const handles = [];
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      expect(calibrate).not.toBeUndefined();
      const { unit, scale } = calibrate;
      expect(unit).toBe('px');
      expect(scale).toBe(1);
    });

    it('Should return US Region for all within single region', () => {
      const image = {
        calibration: { type: CalibrationTypes, sequenceOfUltrasoundRegions },
      };
      const handles = [[25, 25, 25]];
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      const { unit, scale, scaleY } = calibrate;
      expect(unit).toBe('cm US Region');
      expect(scale).toBe(0.5);
      expect(scaleY).toBe(0.25);
    });
    it('Should return px for mixed region', () => {
      const image = {
        calibration: { type: CalibrationTypes, sequenceOfUltrasoundRegions },
      };
      const handles = [[16, 16, 16]];
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      const { unit } = calibrate;
      expect(unit).toBe('px');
    });
    it('Should return mm for external', () => {
      const image = {
        calibration: { type: CalibrationTypes, sequenceOfUltrasoundRegions },
        hasPixelSpacing: true,
        spacing: [2, 2, 2],
      };
      const handles = [[16, 16, 16]];
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      const { unit, scale } = calibrate;
      expect(unit).toBe('mm');
      expect(scale).toBe(0.5);
    });

    it('Should return ms and scale in milliseconds for ECG region', () => {
      const image = {
        calibration: {
          sequenceOfUltrasoundRegions: [
            {
              regionLocationMinX0: 0,
              regionLocationMaxX1: 1000,
              regionLocationMinY0: 0,
              regionLocationMaxY1: 1000,
              physicalUnitsXDirection: 4, // seconds
              physicalUnitsYDirection: -1, // mV
              physicalDeltaX: 0.001, // 1 ms per sample in seconds
              physicalDeltaY: 0.005,
              regionDataType: 1,
            },
          ],
        },
      };
      const handles = [
        [10, 10, 0],
        [100, 10, 0],
      ];
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      const { unit, scale, scaleY } = calibrate;
      expect(unit).toBe('ms ECG Region');
      expect(scale).toBe(1); // 1 / (0.001 * 1000) = 1
      expect(scaleY).toBe(200); // 1 / 0.005 = 200
    });

    it('Should return mV for vertical measurement on ECG region', () => {
      const image = {
        calibration: {
          sequenceOfUltrasoundRegions: [
            {
              regionLocationMinX0: 0,
              regionLocationMaxX1: 1000,
              regionLocationMinY0: 0,
              regionLocationMaxY1: 1000,
              physicalUnitsXDirection: 4,
              physicalUnitsYDirection: -1,
              physicalDeltaX: 0.001,
              physicalDeltaY: 0.005,
              regionDataType: 1,
            },
          ],
        },
      };
      const handles = [
        [10, 10, 0],
        [10, 100, 0], // Vertical orientation
      ];
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      const { unit, scale, scaleY } = calibrate;
      expect(unit).toBe('mV ECG Region');
      expect(scale).toBe(1);
      expect(scaleY).toBe(200);
    });

    it('Should support explicit ms unit code (-2) for ECG region', () => {
      const image = {
        calibration: {
          sequenceOfUltrasoundRegions: [
            {
              regionLocationMinX0: 0,
              regionLocationMaxX1: 1000,
              regionLocationMinY0: 0,
              regionLocationMaxY1: 1000,
              physicalUnitsXDirection: -2, // ms
              physicalUnitsYDirection: -1, // mV
              physicalDeltaX: 1, // 1 ms per sample directly
              physicalDeltaY: 0.005,
              regionDataType: 1,
            },
          ],
        },
      };
      const handles = [
        [10, 10, 0],
        [50, 10, 0],
      ];
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      expect(calibrate.unit).toBe('ms ECG Region');
      expect(calibrate.scale).toBe(1);
    });

    // Negative flows
    it('Should fallback to px when handles are outside ECG region bounds', () => {
      const image = {
        calibration: {
          sequenceOfUltrasoundRegions: [
            {
              regionLocationMinX0: 0,
              regionLocationMaxX1: 100,
              regionLocationMinY0: 0,
              regionLocationMaxY1: 100,
              physicalUnitsXDirection: 4,
              physicalUnitsYDirection: -1,
              physicalDeltaX: 0.001,
              physicalDeltaY: 0.005,
              regionDataType: 1,
            },
          ],
        },
      };
      const handles = [
        [50, 50, 0],
        [200, 50, 0], // Handle 2 is outside region bounds (maxX = 100)
      ];
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      expect(calibrate.unit).toBe('px');
      expect(calibrate.scale).toBe(1);
    });

    it('Should handle UNCALIBRATED calibration type explicitly', () => {
      const image = {
        calibration: {
          type: CalibrationTypes.UNCALIBRATED,
          sequenceOfUltrasoundRegions,
        },
      };
      const handles = [[20, 20, 0]];
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      expect(calibrate.unit).toBe('px');
      expect(calibrate.volumeUnit).toBe('voxels');
    });

    it('Should ignore unsupported physical unit pairs and fallback', () => {
      const image = {
        calibration: {
          sequenceOfUltrasoundRegions: [
            {
              regionLocationMinX0: 0,
              regionLocationMaxX1: 100,
              regionLocationMinY0: 0,
              regionLocationMaxY1: 100,
              physicalUnitsXDirection: 99, // unsupported
              physicalUnitsYDirection: 99, // unsupported
              physicalDeltaX: 1,
              physicalDeltaY: 1,
              regionDataType: 99, // unsupported
            },
          ],
        },
      };
      const handles = [[50, 50, 0]];
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      expect(calibrate.unit).toBe('px');
    });
  });

  describe('getCalibratedProbeUnitsAndValue', () => {
    const {
      getCalibratedProbeUnitsAndValue,
    } = require('../../src/utilities/getCalibratedUnits');

    it('returns converted ms and mV values for ECG probe points', () => {
      const image = {
        calibration: {
          sequenceOfUltrasoundRegions: [
            {
              regionLocationMinX0: 0,
              regionLocationMaxX1: 1000,
              regionLocationMinY0: 0,
              regionLocationMaxY1: 65535,
              referencePixelX0: 0,
              referencePixelY0: 32768,
              physicalUnitsXDirection: 4, // seconds -> converted to ms
              physicalUnitsYDirection: -1, // mV
              physicalDeltaX: 0.001, // 1 ms/sample (0.001 s)
              physicalDeltaY: 0.005,
              regionDataType: 1,
            },
          ],
        },
      };
      const point = [250, 32768 + 100]; // 250 samples, +100 units above baseline
      const result = getCalibratedProbeUnitsAndValue(image, [point]);
      expect(result.units).toEqual(['ms', 'mV']);
      expect(result.values[0]).toBeCloseTo(250); // 250 * 0.001 * 1000 = 250 ms
      expect(result.values[1]).toBeCloseTo(0.5); // 100 * 0.005 = 0.5 mV
      expect(result.calibrationType).toBe('ECG Region');
    });

    it('returns raw fallback when point is outside regions or uncalibrated', () => {
      const image = {
        calibration: {
          sequenceOfUltrasoundRegions: [
            {
              regionLocationMinX0: 0,
              regionLocationMaxX1: 100,
              regionLocationMinY0: 0,
              regionLocationMaxY1: 100,
              physicalUnitsXDirection: 4,
              physicalUnitsYDirection: 7,
              physicalDeltaX: 1,
              physicalDeltaY: 1,
              regionDataType: 1,
            },
          ],
        },
      };
      const point = [500, 500]; // outside
      const result = getCalibratedProbeUnitsAndValue(image, [point]);
      expect(result.units).toEqual(['raw']);
      expect(result.values).toEqual([null]);
    });

    it('returns raw fallback for empty image calibration', () => {
      const image = {};
      const result = getCalibratedProbeUnitsAndValue(image, [[10, 10]]);
      expect(result.units).toEqual(['raw']);
      expect(result.values).toEqual([null]);
    });
  });

  describe('getCalibratedAspect', () => {
    const {
      getCalibratedAspect,
    } = require('../../src/utilities/getCalibratedUnits');

    it('returns custom aspect ratio when present in calibration', () => {
      expect(getCalibratedAspect({ calibration: { aspect: 2 } })).toBe(2);
    });

    it('returns default 1 when aspect ratio is absent', () => {
      expect(getCalibratedAspect({})).toBe(1);
    });
  });
});
