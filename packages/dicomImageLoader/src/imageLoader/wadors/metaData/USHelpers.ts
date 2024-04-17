import { getFirstNumberValue } from './getFirstNumberValue';
import getSequenceItems from './getSequenceItems';

/**
 * This function retrieves the ultrasound regions from the provided metadata.
 * @param metadata - The metadata from which to retrieve the ultrasound regions.
 * @returns An array of ultrasound regions, or null if no regions are found.
 */
function getUSEnhancedRegions(metadata) {
  const sequenceOfUltrasoundRegions = getSequenceItems(metadata['00186011']);

  if (!sequenceOfUltrasoundRegions || !sequenceOfUltrasoundRegions.length) {
    return null;
  }

  const regions = sequenceOfUltrasoundRegions.map((sequence) => {
    const physicalDeltaX = getFirstNumberValue(sequence, '0018602C');
    const physicalDeltaY = getFirstNumberValue(sequence, '0018602E');
    const physicalUnitsXDirection = getFirstNumberValue(sequence, '00186024');
    const physicalUnitsYDirection = getFirstNumberValue(sequence, '00186026');

    const regionLocationMinY0 = getFirstNumberValue(sequence, '0018601A');
    const regionLocationMaxY1 = getFirstNumberValue(sequence, '0018601E');
    const regionLocationMinX0 = getFirstNumberValue(sequence, '00186018');
    const regionLocationMaxX1 = getFirstNumberValue(sequence, '0018601C');
    const referencePixelX0 = getFirstNumberValue(sequence, '00186020');
    const referencePixelY0 = getFirstNumberValue(sequence, '00186022');

    const referencePhysicalPixelValueY = getFirstNumberValue(
      sequence,
      '0018602A'
    );
    const referencePhysicalPixelValueX = getFirstNumberValue(
      sequence,
      '00186028'
    );
    const regionSpatialFormat = getFirstNumberValue(sequence, '00186012');

    const regionDataType = getFirstNumberValue(sequence, '00186014');
    const regionFlags = getFirstNumberValue(sequence, '00186016');
    const transducerFrequency = getFirstNumberValue(sequence, '00186030');

    return {
      regionLocationMinY0,
      regionLocationMaxY1,
      regionLocationMinX0,
      regionLocationMaxX1,
      referencePixelX0,
      referencePixelY0,
      physicalDeltaX,
      physicalDeltaY,
      physicalUnitsXDirection,
      physicalUnitsYDirection,
      referencePhysicalPixelValueY,
      referencePhysicalPixelValueX,
      regionSpatialFormat,
      regionDataType,
      regionFlags,
      transducerFrequency,
    };
  });

  return regions;
}
export { getUSEnhancedRegions };
