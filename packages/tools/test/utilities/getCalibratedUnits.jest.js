import { getCalibratedLengthUnitsAndScale } from '../../src/utilities/getCalibratedUnits';

import { describe, it, expect } from '@jest/globals';

const count = 5;

describe('getCalibratedUnits', function () {
  describe('getCalibratedLengthUnitsAndScale', () => {
    it('Should return basic values for uncalibrated non US', () => {
      const image = {};
      const handles = [];
      const calibrate = getCalibratedLengthUnitsAndScale(image, handles);
      expect(calibrate).not.toBeUndefined();
    });
  });
});
