/**
 * This function retrieves the ultrasound regions from the provided metadata.
 * @param metadata - The metadata from which to retrieve the ultrasound regions.
 * @returns An array of ultrasound regions, or null if no regions are found.
 */

function getUSEnhancedRegions(metadata) {
  const sequence = metadata.elements['x00186011'];
  if (!sequence || !sequence.items) {
    return [];
  }

  const regions = sequence.items.map((item) => {
    const physicalDeltaX = item.dataSet.double('x0018602c');
    const physicalDeltaY = item.dataSet.double('x0018602e');
    const physicalUnitsXDirection = item.dataSet.uint16('x00186024');
    const physicalUnitsYDirection = item.dataSet.uint16('x00186026');

    const regionLocationMinY0 = item.dataSet.uint16('x0018601a');
    const regionLocationMaxY1 = item.dataSet.uint16('x0018601e');
    const regionLocationMinX0 = item.dataSet.uint16('x00186018');
    const regionLocationMaxX1 = item.dataSet.uint16('x0018601c');
    const referencePixelX0 = item.dataSet.int32('x00186020') || null;
    const referencePixelY0 = item.dataSet.int32('x00186022') || null;

    const referencePhysicalPixelValueY = item.dataSet.uint16('x0018602a');
    const referencePhysicalPixelValueX = item.dataSet.uint16('x00186028');
    const regionSpatialFormat = item.dataSet.uint16('x00186012');

    const regionDataType = item.dataSet.uint16('x00186014');
    const regionFlags = item.dataSet.uint16('x00186016');
    const transducerFrequency = item.dataSet.uint16('x00186030');
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
