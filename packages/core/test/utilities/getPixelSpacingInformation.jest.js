import {
  getERMF,
  calculateRadiographicPixelSpacing,
} from '../../src/utilities';
import { describe, it, expect } from '@jest/globals';

const EstimatedRadiographicMagnificationFactor = 1.1;
const ImagerPixelSpacing = [100, 100];
const PixelSpacing = [50, 50];

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

    it('Should get ERMF for sid/sod', () => {
      const instance = {
        ImagerPixelSpacing,
        DistanceSourceToDetector: 100,
        DistanceSourceToPatient: 50,
      };
      const ermf = getERMF(instance);
      expect(ermf).toBe(2);
    });
    it('Should get ERMF for imager pixel spacing', () => {
      const instance = {
        PixelSpacing,
        ImagerPixelSpacing,
      };
      const ermf = getERMF(instance);
      // Returns true to indicate use original pixel spacing to avoid lossy changes
      expect(ermf).toBe(true);
    });
  });

  describe('calculateRadiographicPixelSpacing', () => {
    it('Should return ERMF for calibration type GEOMETRY', () => {
      const instance = {
        PixelSpacing,
        PixelSpacingCalibrationType: 'GEOMETRY',
      };
      const { type } = calculateRadiographicPixelSpacing(instance);
      expect(type).toBe('ERMF');
    });
    it('Should return Calibrated for calibration type FIDUCIAL', () => {
      const instance = {
        PixelSpacing,
        PixelSpacingCalibrationType: 'FIDUCIAL',
      };
      const { type } = calculateRadiographicPixelSpacing(instance);
      expect(type).toBe('Calibrated');
    });
    it('Should return Projection for imager only', () => {
      const instance = {
        ImagerPixelSpacing,
      };
      const { type } = calculateRadiographicPixelSpacing(instance);
      expect(type).toBe('Proj');
    });
    it('Should return Unknown for pixel only', () => {
      const instance = {
        PixelSpacing,
      };
      const { type } = calculateRadiographicPixelSpacing(instance);
      expect(type).toBe('Unknown');
    });
    it('Should return ERMF', () => {
      const instance = {
        ImagerPixelSpacing,
        PixelSpacing,
      };
      const { type } = calculateRadiographicPixelSpacing(instance);
      expect(type).toBe('ERMF');
    });
  });
});
