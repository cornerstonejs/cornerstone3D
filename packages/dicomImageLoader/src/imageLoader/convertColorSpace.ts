import {
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFull422ByPixel,
  convertYBRFullByPlane,
  convertPALETTECOLOR,
} from './colorSpaceConverters/index';

function convertRGB(imageFrame, colorBuffer, useRGBA) {
  if (imageFrame.planarConfiguration === 0) {
    convertRGBColorByPixel(imageFrame.pixelData, colorBuffer, useRGBA);
  } else {
    convertRGBColorByPlane(imageFrame.pixelData, colorBuffer, useRGBA);
  }
}

function convertYBRFull(imageFrame, colorBuffer, useRGBA) {
  if (imageFrame.planarConfiguration === 0) {
    convertYBRFullByPixel(imageFrame.pixelData, colorBuffer, useRGBA);
  } else {
    convertYBRFullByPlane(imageFrame.pixelData, colorBuffer, useRGBA);
  }
}

/**
 * This function checks color space conversion data requirements before
 * apply them
 * @param imageFrame
 * @param RGBA
 * @returns
 */
export function isColorConversionRequirementsFulfilled(imageFrame, RGBA) {
  const { rows, columns } = imageFrame;
  if (
    imageFrame.photometricInterpretation === 'YBR_FULL_422' &&
    imageFrame.pixelDataLength === 2 * rows * columns
  ) {
    return true;
  } else {
    return false;
  }
}

export default function convertColorSpace(imageFrame, colorBuffer, useRGBA) {
  // convert based on the photometric interpretation
  if (imageFrame.photometricInterpretation === 'RGB') {
    convertRGB(imageFrame, colorBuffer, useRGBA);
  } else if (imageFrame.photometricInterpretation === 'YBR_RCT') {
    convertRGB(imageFrame, colorBuffer, useRGBA);
  } else if (imageFrame.photometricInterpretation === 'YBR_ICT') {
    convertRGB(imageFrame, colorBuffer, useRGBA);
  } else if (imageFrame.photometricInterpretation === 'PALETTE COLOR') {
    convertPALETTECOLOR(imageFrame, colorBuffer, useRGBA);
  } else if (imageFrame.photometricInterpretation === 'YBR_FULL_422') {
    convertYBRFull422ByPixel(imageFrame.pixelData, colorBuffer, useRGBA);
  } else if (imageFrame.photometricInterpretation === 'YBR_FULL') {
    convertYBRFull(imageFrame, colorBuffer, useRGBA);
  } else {
    // TODO - handle YBR_PARTIAL and 420 colour spaces
    throw new Error(
      `No color space conversion for photometric interpretation ${imageFrame.photometricInterpretation}`
    );
  }
}
