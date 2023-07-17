import CalibrationTypes from '../enums/CalibrationTypes';

/**
 * IImageCalibration is an object that stores information about the type
 * of image calibration.
 */
export interface IImageCalibration {
  /**
   * The pixel spacing for the image, in mm between pixel centers
   * These are not required, and are deprecated in favour of getting the original
   * image spacing and then applying the transforms.  The values here should
   * be identical to original spacing.
   */
  rowPixelSpacing?: number;
  columnPixelSpacing?: number;
  /** The scaling of measurement values relative to the base pixel spacing (1 if not specified) */
  scale?: number;
  /**
   * The calibration aspect ratio for non-square calibrations.
   * This is the aspect ratio similar to the scale above that applies when
   * the viewport is displaying non-square image pixels as square screen pixels.
   *
   * Defaults to 1 if not specified, and is also 1 if the Viewport has squared
   * up the image pixels so that they are displayed as a square.
   * Not well handled currently as this needs to be incorporated into
   * tools when doing calculations.
   */
  aspect?: number;
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
