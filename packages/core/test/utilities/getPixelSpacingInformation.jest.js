import { getERMF } from '../../src/utilities';
import { describe, it, expect } from '@jest/globals';

const EstimatedRadiographicMagnificationFactor = 1.1;
const ImagerPixelSpacing = [1.48, 1.48];
const PixelSpacing = [1.37, 1.37];

describe('getPixelSpacingInformation', function () {
  describe('getERMF', () => {
    it('Should get ERMF for included ERMF value', () => {
      const instance = {
        EstimatedRadiographicMagnificationFactor,
      };
      const ermf = getERMF(instance);
      expect(ermf).toBe(1.1);
    });

    it('Should not get ERMF for same pixel/imager spacing', () => {
      const instance = {
        PixelSpacing: ImagerPixelSpacing,
        ImagerPixelSpacing,
      };
      const ermf = getERMF(instance);
      expect(ermf).toBeUndefined();
    });
  });
});
