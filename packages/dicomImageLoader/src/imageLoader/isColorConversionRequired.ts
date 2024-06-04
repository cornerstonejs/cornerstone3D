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
export default function isColorConversionRequired(imageFrame, transferSyntax) {
  if (imageFrame === undefined) {
    return false;
  }
  const { rows, columns, photometricInterpretation, pixelDataLength } =
    imageFrame;

  // if it is jpeg don't convert
  if (transferSyntax === '1.2.840.10008.1.2.4.50') {
    return false;
  }

  if (photometricInterpretation.endsWith('420')) {
    return (
      pixelDataLength ===
      (3 * Math.ceil(columns / 2) + Math.floor(columns / 2)) * rows
    );
  } else if (photometricInterpretation.endsWith('422')) {
    return (
      pixelDataLength ===
      (3 * Math.ceil(columns / 2) + Math.floor(columns / 2)) *
        Math.ceil(rows / 2) +
        Math.floor(rows / 2) * columns
    );
  } else {
    return photometricInterpretation !== 'RGB';
    // and it is one of the rle and lei cases then we need to convert
  }
}
