import {
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFull422ByPixel,
  convertYBRFullByPlane,
  convertPALETTECOLOR,
} from './colorSpaceConverters/index.js';

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
    throw new Error(
      `No color space conversion for photometric interpretation ${imageFrame.photometricInterpretation}`
    );
  }
}
