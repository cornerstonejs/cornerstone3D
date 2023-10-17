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
  if (
    imageFrame.photometricInterpretation === 'YBR_FULL_422' &&
    imageFrame.pixelDataLength === 2 * rows * columns &&
    rows % 2 === 0
  ) {
    return true;
  } else {
    return false;
  }
}
