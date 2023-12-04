import getNumberValues from './getNumberValues';
import getSequenceItems from './getSequenceItems';

function getUSEnhancedRegions(metadata) {
  const sequenceOfUltrasoundRegions = getSequenceItems(metadata['00186011']);

  if (!sequenceOfUltrasoundRegions || !sequenceOfUltrasoundRegions.length) {
    return null;
  }

  function getFirstNumberValue(sequence: any, key: string): number | null {
    const values = getNumberValues(sequence[key]);
    return values ? values[0] : null;
  }

  const regions = sequenceOfUltrasoundRegions.map((sequence) => {
    const physicalDeltaX = getFirstNumberValue(sequence, '0018602C');
    const physicalDeltaY = getFirstNumberValue(sequence, '0018602E');
    const physicalUnitXDirection = getFirstNumberValue(sequence, '00186024');
    const physicalUnitYDirection = getFirstNumberValue(sequence, '00186026');

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
      physicalUnitXDirection,
      physicalUnitYDirection,
      referencePhysicalPixelValueY,
      referencePhysicalPixelValueX,
      regionSpatialFormat,
      regionDataType,
      regionFlags,
      transducerFrequency,
      pixelSpacing: [physicalDeltaX * 10, physicalDeltaY * 10],
    };
  });

  return regions;
}

export { getUSEnhancedRegions };
