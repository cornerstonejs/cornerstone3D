import CalibrationTypes from '../enums/CalibrationTypes';

/**
 * IImageCalibration is an object that stores information about the type
 * of image calibration.
 */
export interface IImageCalibration {
  /** The pixel spacing for the image, in mm between pixel centers */
  rowPixelSpacing?: number;
  columnPixelSpacing?: number;
  /** The scaling of this image - new spacing = original pixelSpacing/scale */
  scale?: number;
  /** The type of the pixel spacing, distinguishing between various
   * types projection (CR/DX/MG) spacing and volumetric spacing (the type is
   * an empty string as it doesn't get a suffix, but this distinguishes it
   * from other types)
   */
  type: CalibrationTypes;
  /** A tooltip which can be used to explain the calibration information */
  tooltip?: string;
  /** The DICOM defined ultrasound regions.  Used for non-distance spacing units. */
  sequenceOfUltrasoundRegions?: Record<string, unknown>[];
}

export default IImageCalibration;
