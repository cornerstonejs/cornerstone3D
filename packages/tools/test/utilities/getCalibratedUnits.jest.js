import { Enums } from '@cornerstonejs/core';
import {
  getCalibratedLengthUnitsAndScale,
  getCalibratedAreaFromWorld,
} from '../../src/utilities/getCalibratedUnits';

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

  describe('getCalibratedAreaFromWorld', () => {
    it('Should leave an uncalibrated area in mm² as it is', () => {
      const image = { hasPixelSpacing: true, spacing: [0.5, 0.25, 2] };
      const calibrate = getCalibratedLengthUnitsAndScale(image, []);
      expect(getCalibratedAreaFromWorld(image, calibrate, 200)).toBeCloseTo(
        200
      );
    });

    it('Should convert an area in pixels to the units of an ultrasound region', () => {
      const image = {
        calibration: { type: CalibrationTypes, sequenceOfUltrasoundRegions },
      };
      // the second region: 2 and 4 cm per pixel across and down
      const calibrate = getCalibratedLengthUnitsAndScale(image, [[25, 25, 0]]);
      expect(calibrate.areaUnit).toBe('cm² US Region');
      expect(getCalibratedAreaFromWorld(image, calibrate, 10)).toBeCloseTo(80);
    });

    it('Should use the column scale for both directions when there is no row scale', () => {
      expect(getCalibratedAreaFromWorld({}, { scale: 0.5 }, 10)).toBeCloseTo(
        40
      );
    });

    it('Should default to unit spacing and scale', () => {
      expect(getCalibratedAreaFromWorld({}, {}, 10)).toBeCloseTo(10);
    });
  });
});
