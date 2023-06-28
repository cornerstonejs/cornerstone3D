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
   * types projection (CR/DX/MG) spacing and volumetric spacing ('')
   */
  type: CalibrationTypes;

  // A tooltip which can be used to explain the calibration information
  tooltip?: string;
  /** Indication that the image has some spacing information (the pixelSpacing
   * when hasPixelSpacing is null can just be 1,1) */
  hasPixelSpacing?: boolean;
  /** Indication of projection (eg X-Ray type) spacing and volumetric type */
  isProjection?: boolean;
  // The DICOM defined ultrasound regions.  Used for non-distance spacing
  // units.
  sequenceOfUltrasoundRegions?: Record<string, unknown>[];
}

export default IImageCalibration;
