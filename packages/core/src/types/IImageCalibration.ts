import CalibrationTypes from '../enums/CalibrationTypes';

/**
 * IImageCalibration is an object that stores information about the type
 * of image calibration.
 */
export interface IImageCalibration {
  PixelSpacing: [number, number];
  type: CalibrationTypes;
  hasPixelSpacing?: boolean;
  isProjection?: boolean;
  SequenceOfUltrasoundRegions?: Record<string, unknown>[];
}

export default IImageCalibration;
