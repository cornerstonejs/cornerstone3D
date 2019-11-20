/* eslint no-bitwise: 0 */

function getMinStoredPixelValue(dataSet) {
  const pixelRepresentation = dataSet.uint16('x00280103');
  const bitsStored = dataSet.uint16('x00280101');

  if (pixelRepresentation === 0) {
    return 0;
  }

  return -1 << (bitsStored - 1);
}

// 0 = unsigned / US, 1 = signed / SS
function getModalityLUTOutputPixelRepresentation(dataSet) {
  // CT SOP Classes are always signed
  const sopClassUID = dataSet.string('x00080016');

  if (
    sopClassUID === '1.2.840.10008.5.1.4.1.1.2' ||
    sopClassUID === '1.2.840.10008.5.1.4.1.1.2.1'
  ) {
    return 1;
  }

  // if rescale intercept and rescale slope are present, pass the minimum stored
  // pixel value through them to see if we get a signed output range
  const rescaleIntercept = dataSet.floatString('x00281052');
  const rescaleSlope = dataSet.floatString('x00281053');

  if (rescaleIntercept !== undefined && rescaleSlope !== undefined) {
    const minStoredPixelValue = getMinStoredPixelValue(dataSet); //
    const minModalityLutValue =
      minStoredPixelValue * rescaleSlope + rescaleIntercept;

    if (minModalityLutValue < 0) {
      return 1;
    }

    return 0;
  }

  // Output of non linear modality lut is always unsigned
  if (dataSet.elements.x00283000 && dataSet.elements.x00283000.length > 0) {
    return 0;
  }

  // If no modality lut transform, output is same as pixel representation
  return dataSet.uint16('x00280103');
}

export default getModalityLUTOutputPixelRepresentation;
