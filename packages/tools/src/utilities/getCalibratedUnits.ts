import { Enums } from '@cornerstonejs/core';

const { CalibrationTypes } = Enums;
const PIXEL_UNITS = 'px';

const SUPPORTED_REGION_DATA_TYPES = [
  1, // Tissue
];

/**
 * Extracts the length units and the type of calibration for those units
 * into the response.  The length units will typically be either mm or px
 * while the calibration type can be any of a number of different calibration types.
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
  const [imageIndex1, imageIndex2] = handles;
  const { calibration, hasPixelSpacing } = image;
  // Anachronistic - moving to using calibration consistently, but not completed yet
  const units = hasPixelSpacing ? 'mm' : PIXEL_UNITS;
  if (
    !calibration ||
    (!calibration.type && !calibration.sequenceOfUltrasoundRegions)
  ) {
    return units;
  }
  if (calibration.type === CalibrationTypes.UNCALIBRATED) {
    return PIXEL_UNITS;
  }
  if (calibration.sequenceOfUltrasoundRegions) {
    // here we need to check if both imageIndex1 and imageIndex2 are in the same region
    // we can use the extent of the region to determine this, if they are
    // across regions, we need to return units which was the default behavior

    // check see if we have supported region data types
    const supportedRegionsMetadata =
      calibration.sequenceOfUltrasoundRegions.filter(
        (region) =>
          SUPPORTED_REGION_DATA_TYPES.indexOf(region.regionDataType) > -1
      );

    if (!supportedRegionsMetadata.length) {
      return units;
    }

    // check to see if the imageIndex1 and imageIndex2 are in the same region
    const region = supportedRegionsMetadata.find(
      (region) =>
        imageIndex1[0] >= region.regionLocationMinX0 &&
        imageIndex1[0] <= region.regionLocationMaxX1 &&
        imageIndex1[1] >= region.regionLocationMinY0 &&
        imageIndex1[1] <= region.regionLocationMaxY1 &&
        imageIndex2[0] >= region.regionLocationMinX0 &&
        imageIndex2[0] <= region.regionLocationMaxX1 &&
        imageIndex2[1] >= region.regionLocationMinY0 &&
        imageIndex2[1] <= region.regionLocationMaxY1
    );

    if (!region) {
      return units;
    }

    return 'mm:US Region';
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
  if (calibration.sequenceOfUltrasoundRegions) {
    return 'US Region';
  }
  return `${units} ${calibration.type}`;
};

/**
 * Gets the scale divisor for converting from internal spacing to
 * image spacing for calibrated images.
 */
const getCalibratedScale = (image, handles) => {
  if (image.calibration.sequenceOfUltrasoundRegions) {
    // return the correct scale for US Regions
    // image.spacing / image.us.space
    return 1;
  } else if (image.calibration.scale) {
    return image.calibration.scale;
  } else {
    return 1;
  }
};

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
