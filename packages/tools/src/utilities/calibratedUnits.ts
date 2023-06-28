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
 *   between various points (eg angled ERMF or US Region)
 * @param image - to extract the calibration from
 * @param image.calibration - calibration value to extract units form
 * @returns String containing the units and type of calibration
 */
const calibratedLengthUnits = (handles, image): string => {
  const { calibration, hasPixelSpacing } = image;
  const units = hasPixelSpacing ? 'mm' : 'px';
  if (!calibration || !calibration.type) return units;
  // TODO - handle US regions properly
  if (calibration.SequenceOfUltrasoundRegions) return 'US Region';
  return `${units} ${calibration.type}`;
};

const SQUARE = '\xb2';
/**
 *  Extracts the area units, including the squared sign plus calibration type.
 */
const calibratedAreaUnits = (handles, image): string => {
  const { calibration, hasPixelSpacing } = image;
  const units = (hasPixelSpacing ? 'mm' : 'px') + SQUARE;
  if (!calibration || !calibration.type) return units;
  if (calibration.SequenceOfUltrasoundRegions) return 'US Region';
  return `${units} ${calibration.type}`;
};

const getScale = (image) => image.calibration?.scale || 1;

export default calibratedLengthUnits;

export { calibratedAreaUnits, calibratedLengthUnits, getScale };
