import { Enums } from '@cornerstonejs/core';
import { getCalibratedLengthUnitsAndScale } from '../../src/utilities/getCalibratedUnits';
import BaseTool from '../../src/tools/base/BaseTool';

const { CalibrationTypes } = Enums;

import { describe, it, expect } from '@jest/globals';

const count = 5;

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
      const { unit, scale, scaleY } = calibrate;
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
      const { unit, scale, scaleY } = calibrate;
      expect(unit).toBe('mm');
      expect(scale).toBe(0.5);
    });
  });

  describe('ECG region lengths', () => {
    const ecgImage = {
      calibration: {
        sequenceOfUltrasoundRegions: [
          {
            regionLocationMinX0: 0,
            regionLocationMaxX1: 1000,
            regionLocationMinY0: 0,
            regionLocationMaxY1: 4000,
            physicalDeltaX: 1,
            physicalDeltaY: 0.001,
            physicalUnitsXDirection: -2,
            physicalUnitsYDirection: -1,
          },
        ],
      },
    };
    const lengthOf = (handles) => {
      const calibrate = getCalibratedLengthUnitsAndScale(ecgImage, handles);
      return {
        unit: calibrate.unit,
        length: BaseTool.calculateLengthInIndex(calibrate, handles),
      };
    };

    it('gives an uncalibrated px length, as a US region with mixed units does', () => {
      const { unit, length } = lengthOf([
        [100, 2000, 3],
        [400, 2400, 3],
      ]);

      expect(unit).toBe('px');
      expect(length).toBeCloseTo(500, 6);
    });
  });
});
