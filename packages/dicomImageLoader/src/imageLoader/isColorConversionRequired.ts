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
export default function isColorConversionRequired(imageFrame) {
  if (imageFrame === undefined) {
    return false;
  }
  const {
    rows,
    columns,
    photometricInterpretation,
    pixelDataLength,
    planarConfiguration,
  } = imageFrame;

  // if it is rgba don't convert (typically jpeg, jpeg-xl, jpeg2000 etc)
  if (pixelDataLength === 4 * columns * rows) {
    // RGBA - JPEG
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
    return photometricInterpretation !== 'RGB' || planarConfiguration === 1;
    // and it is one of the rle and lei cases then we need to convert
  }
}
