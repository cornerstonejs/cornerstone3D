import {
  getERMF,
  calculateRadiographicPixelSpacing,
  getPixelSpacingInformation,
} from '../../src/utilities';
import { CalibrationTypes } from '../../src/enums';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

const EstimatedRadiographicMagnificationFactor = 1.1;
const ImagerPixelSpacing = [100, 100];
const PixelSpacing = [50, 50];

const CR_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.1';
const CT_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.2';

const Messages = {
  NOT_CALIBRATED: 'Measurements not calibrated.',
  CORRECTED_AT_MODALITY: 'Measurements corrected at modality.',
  NOT_CORRECTED_AT_DETECTOR:
    'Measurements not corrected. Measured size is at detector.',
  CORRECTED_USING_ERMF: 'Measurements corrected using the ERMF.',
  UNCERTAIN: 'Measurements are uncertain.',
  USER_CALIBRATED: 'Measurements are user calibrated.',
};

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

    it('Should get ERMF true for larger imager than pixel spacing', () => {
      const instance = {
        PixelSpacing,
        ImagerPixelSpacing,
      };
      const ermf = getERMF(instance);
      // Returns true to indicate use original pixel spacing to avoid lossy changes
      expect(ermf).toBe(true);
    });

    it('Should return undefined when no spacing information is available', () => {
      const ermf = getERMF({});
      expect(ermf).toBeUndefined();
    });
  });

  describe('calculateRadiographicPixelSpacing', () => {
    let warnSpy;
    let errorSpy;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('Should return Calibrated for calibration type FIDUCIAL with user-calibrated message', () => {
      const instance = {
        PixelSpacing,
        PixelSpacingCalibrationType: 'FIDUCIAL',
      };
      const result = calculateRadiographicPixelSpacing(instance);
      expect(result.type).toBe(CalibrationTypes.CALIBRATED);
      expect(result.PixelSpacing).toBe(PixelSpacing);
      expect(result.isProjection).toBe(true);
      expect(result.Message).toBe(Messages.USER_CALIBRATED);
    });

    it('Should prefer FIDUCIAL over GEOMETRY if both somehow coexist', () => {
      // Only a single calibration type can be set, but FIDUCIAL is checked first.
      const instance = {
        PixelSpacing,
        PixelSpacingCalibrationType: 'FIDUCIAL',
        ImagerPixelSpacing,
      };
      const { type, Message } = calculateRadiographicPixelSpacing(instance);
      expect(type).toBe(CalibrationTypes.CALIBRATED);
      expect(Message).toBe(Messages.USER_CALIBRATED);
    });

    it('Should return ERMF for calibration type GEOMETRY with corrected-at-modality message', () => {
      const instance = {
        PixelSpacing,
        ImagerPixelSpacing,
        PixelSpacingCalibrationType: 'GEOMETRY',
      };
      const result = calculateRadiographicPixelSpacing(instance);
      expect(result.type).toBe(CalibrationTypes.ERMF);
      expect(result.PixelSpacing).toBe(PixelSpacing);
      expect(result.Message).toBe(Messages.CORRECTED_AT_MODALITY);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('Should warn when calibration is GEOMETRY but PixelSpacing equals ImagerPixelSpacing', () => {
      const instance = {
        PixelSpacing: [75, 75],
        ImagerPixelSpacing: [75, 75],
        PixelSpacingCalibrationType: 'GEOMETRY',
      };
      const { type } = calculateRadiographicPixelSpacing(instance);
      expect(type).toBe(CalibrationTypes.ERMF);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('Should not warn when calibration is GEOMETRY and ImagerPixelSpacing is absent', () => {
      const instance = {
        PixelSpacing,
        PixelSpacingCalibrationType: 'GEOMETRY',
      };
      const { type, Message } = calculateRadiographicPixelSpacing(instance);
      expect(type).toBe(CalibrationTypes.ERMF);
      expect(Message).toBe(Messages.CORRECTED_AT_MODALITY);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('Should correct ImagerPixelSpacing by ERMF when ERMF > 1', () => {
      const instance = {
        ImagerPixelSpacing: [2, 2],
        EstimatedRadiographicMagnificationFactor: 2,
      };
      const result = calculateRadiographicPixelSpacing(instance);
      expect(result.type).toBe(CalibrationTypes.ERMF);
      expect(result.PixelSpacing).toEqual([1, 1]);
      expect(result.Message).toBe(Messages.CORRECTED_USING_ERMF);
    });

    it('Should pass-through PixelSpacing when ERMF is boolean true (pre-corrected)', () => {
      const instance = {
        ImagerPixelSpacing,
        PixelSpacing,
      };
      const result = calculateRadiographicPixelSpacing(instance);
      // getERMF returns true here because ImagerPixelSpacing[0] > PixelSpacing[0]
      expect(result.type).toBe(CalibrationTypes.ERMF);
      expect(result.PixelSpacing).toBe(PixelSpacing);
      expect(result.Message).toBe(Messages.CORRECTED_USING_ERMF);
    });

    it('Should log an error and fall through when ERMF is an illegal numeric value (<=1)', () => {
      const instance = {
        ImagerPixelSpacing,
        EstimatedRadiographicMagnificationFactor: 0.5,
      };
      const result = calculateRadiographicPixelSpacing(instance);
      expect(errorSpy).toHaveBeenCalledWith('Illegal ERMF value:', 0.5);
      // Falls through to the PROJECTION branch since ImagerPixelSpacing is valid
      expect(result.type).toBe(CalibrationTypes.PROJECTION);
      expect(result.PixelSpacing).toBe(ImagerPixelSpacing);
      expect(result.Message).toBe(Messages.NOT_CORRECTED_AT_DETECTOR);
    });

    it('Should return Projection using PixelSpacing when both spacings are present without ERMF', () => {
      // Same-valued spacings and no sid/sod/ermf — getERMF is undefined
      const instance = {
        PixelSpacing: [0.5, 0.5],
        ImagerPixelSpacing: [0.5, 0.5],
      };
      const result = calculateRadiographicPixelSpacing(instance);
      expect(result.type).toBe(CalibrationTypes.PROJECTION);
      expect(result.PixelSpacing).toBe(instance.PixelSpacing);
      expect(result.Message).toBe(Messages.CORRECTED_AT_MODALITY);
    });

    it('Should return Projection using ImagerPixelSpacing when only ImagerPixelSpacing is valid', () => {
      const instance = {
        ImagerPixelSpacing,
      };
      const result = calculateRadiographicPixelSpacing(instance);
      expect(result.type).toBe(CalibrationTypes.PROJECTION);
      expect(result.PixelSpacing).toBe(ImagerPixelSpacing);
      expect(result.Message).toBe(Messages.NOT_CORRECTED_AT_DETECTOR);
    });

    it('Should return Unknown/UNCERTAIN when only PixelSpacing is present', () => {
      const instance = {
        PixelSpacing,
      };
      const result = calculateRadiographicPixelSpacing(instance);
      expect(result.type).toBe(CalibrationTypes.UNKNOWN);
      expect(result.PixelSpacing).toBe(PixelSpacing);
      expect(result.Message).toBe(Messages.UNCERTAIN);
    });

    it('Should return Unknown/NOT_CALIBRATED when neither spacing is present', () => {
      const result = calculateRadiographicPixelSpacing({});
      expect(result.type).toBe(CalibrationTypes.UNKNOWN);
      expect(result.PixelSpacing).toBeUndefined();
      expect(result.Message).toBe(Messages.NOT_CALIBRATED);
    });

    it('Should treat invalid ImagerPixelSpacing (zero values) as not usable', () => {
      // hasImagerPixelSpacing true, but isValidSpacing false → branch falls through
      const instance = {
        PixelSpacing,
        ImagerPixelSpacing: [0, 0],
      };
      const result = calculateRadiographicPixelSpacing(instance);
      expect(result.type).toBe(CalibrationTypes.UNKNOWN);
      expect(result.PixelSpacing).toBe(PixelSpacing);
      expect(result.Message).toBe(Messages.UNCERTAIN);
    });

    it('Should treat non-array ImagerPixelSpacing as absent', () => {
      const instance = {
        PixelSpacing,
        ImagerPixelSpacing: 'not-an-array',
      };
      const result = calculateRadiographicPixelSpacing(instance);
      expect(result.type).toBe(CalibrationTypes.UNKNOWN);
      expect(result.PixelSpacing).toBe(PixelSpacing);
      expect(result.Message).toBe(Messages.UNCERTAIN);
    });

    it('Should treat wrong-length PixelSpacing as absent', () => {
      const instance = {
        PixelSpacing: [1],
        PixelSpacingCalibrationType: 'FIDUCIAL',
      };
      const result = calculateRadiographicPixelSpacing(instance);
      // FIDUCIAL branch requires hasSpacing, so this falls through to NOT_CALIBRATED
      expect(result.type).toBe(CalibrationTypes.UNKNOWN);
      expect(result.Message).toBe(Messages.NOT_CALIBRATED);
    });
  });

  describe('getPixelSpacingInformation', () => {
    it('Should delegate to calculateRadiographicPixelSpacing for a projection SOPClassUID', () => {
      const instance = {
        SOPClassUID: CR_SOP_CLASS_UID,
        PixelSpacing,
        PixelSpacingCalibrationType: 'FIDUCIAL',
      };
      const result = getPixelSpacingInformation(instance);
      expect(result.type).toBe(CalibrationTypes.CALIBRATED);
      expect(result.isProjection).toBe(true);
      expect(result.Message).toBe(Messages.USER_CALIBRATED);
    });

    it('Should return NOT_APPLICABLE for non-projection SOPClassUID', () => {
      const instance = {
        SOPClassUID: CT_SOP_CLASS_UID,
        PixelSpacing,
      };
      const result = getPixelSpacingInformation(instance);
      expect(result.type).toBe(CalibrationTypes.NOT_APPLICABLE);
      expect(result.isProjection).toBe(false);
      expect(result.PixelSpacing).toBe(PixelSpacing);
      expect(result.Message).toBeUndefined();
    });

    it('Should return NOT_APPLICABLE when SOPClassUID is missing', () => {
      const result = getPixelSpacingInformation({ PixelSpacing });
      expect(result.type).toBe(CalibrationTypes.NOT_APPLICABLE);
      expect(result.isProjection).toBe(false);
    });
  });
});
