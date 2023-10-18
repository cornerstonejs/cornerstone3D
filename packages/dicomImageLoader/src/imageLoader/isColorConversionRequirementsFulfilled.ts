/**
 * This function checks color space conversion data requirements before
 * apply them
 * @param imageFrame
 * @param RGBA
 * @returns
 */
export default function isColorConversionRequirementsFulfilled(
  imageFrame,
  RGBA
) {
  const { rows, columns } = imageFrame;
  if (imageFrame.photometricInterpretation === 'RGB') {
    return imageFrame.length % 3 === 0;
  } else if (imageFrame.photometricInterpretation === 'YBR_RCT') {
    return imageFrame.length % 3 === 0;
  } else if (imageFrame.photometricInterpretation === 'YBR_ICT') {
    return imageFrame.length % 3 === 0;
  } else if (imageFrame.photometricInterpretation === 'PALETTE COLOR') {
    return true;
  } else if (imageFrame.photometricInterpretation === 'YBR_FULL_422') {
    return imageFrame.pixelDataLength === 2 * rows * columns && rows % 2 === 0;
  } else if (imageFrame.photometricInterpretation === 'YBR_FULL') {
    return imageFrame.length % 3 === 0;
  } else {
    return true;
  }
}
