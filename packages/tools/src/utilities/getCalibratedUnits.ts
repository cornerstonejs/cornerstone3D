import { Enums } from '@cornerstonejs/core';

const { CalibrationTypes } = Enums;
const PIXEL_UNITS = 'px';

/**
 * Extracts the length units and the type of calibration for those units
 * into the response.  The length units will typically be either mm or px
 * while the calibration type can be any of a number of different calibraiton types.
 *
 * Volumetric images have no calibration type, so are just the raw mm.
 *
 * TODO: Handle region calibration
 *
 * @param handles - used to detect if the spacing information is different
 *   between various points (eg angled ERMF or US Region).
 *   Currently unused, but needed for correct US Region handling
 * @param image - to extract the calibration from
 *        image.calibration - calibration value to extract units form
 * @returns String containing the units and type of calibration
 */
const getCalibratedLengthUnits = (handles, image): string => {
  const { calibration, hasPixelSpacing } = image;
  // Anachronistic - moving to using calibration consistently, but not completed yet
  const units = hasPixelSpacing ? 'mm' : PIXEL_UNITS;
  if (!calibration || !calibration.type) {
    return units;
  }
  if (calibration.type === CalibrationTypes.UNCALIBRATED) {
    return PIXEL_UNITS;
  }
  // TODO - handle US regions properly
  if (calibration.SequenceOfUltrasoundRegions) {
    return 'US Region';
  }
  return `${units} ${calibration.type}`;
};

const SQUARE = '\xb2';
/**
 *  Extracts the area units, including the squared sign plus calibration type.
 */
const getCalibratedAreaUnits = (handles, image): string => {
  const { calibration, hasPixelSpacing } = image;
  const units = (hasPixelSpacing ? 'mm' : PIXEL_UNITS) + SQUARE;
  if (!calibration || !calibration.type) {
    return units;
  }
  if (calibration.SequenceOfUltrasoundRegions) {
    return 'US Region';
  }
  return `${units} ${calibration.type}`;
};

/**
 * Gets the scale divisor for converting from internal spacing to
 * image spacing for calibrated images.
 */
const getCalibratedScale = (image) => image.calibration?.scale || 1;

/** Gets the aspect ratio of the screen display relative to the image
 * display in order to square up measurement values.
 * That is, suppose the spacing on the image is 1, 0.5 (x,y spacing)
 * This is displayed at 1, 1 spacing on screen, then the
 * aspect value will be 1/0.5 = 2
 */
const getCalibratedAspect = (image) => image.calibration?.aspect || 1;

export default getCalibratedLengthUnits;

export {
  getCalibratedAreaUnits,
  getCalibratedLengthUnits,
  getCalibratedScale,
  getCalibratedAspect,
};
