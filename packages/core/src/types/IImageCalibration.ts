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
  /** The scaling of this image - new spacing = original pixelSpacing/scale */
  scale?: number;
  /**
   * The aspect ratio of the screen.
   * Defaults to 1 if not specified.
   * Not well handled currently as changing the aspect ratio does not result in
   * updating measurements in any meaningful way.
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
