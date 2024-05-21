/**
 * This function checks color space conversion data requirements before
 * applying them. This function was created to solve problems like the one
 * discussed in here https://discourse.orthanc-server.org/t/orthanc-convert-ybr-to-rgb-but-does-not-change-metadata/3533/17
 * In this case, Orthanc server converts the pixel data from YBR to RGB, but maintain
 * the photometricInterpretation dicom tag in YBR
 * @param imageFrame
 * @param RGBA
 * @returns
 */
export default function isColorConversionRequirementsFulfilled(
  imageFrame,
  RGBA
) {
  if (imageFrame === undefined) {
    return false;
  }
  const { rows, columns } = imageFrame;
  if (imageFrame.photometricInterpretation === 'YBR_FULL_422') {
    return imageFrame.pixelDataLength === 2 * rows * columns && rows % 2 === 0;
  } else {
    return true;
  }
}
