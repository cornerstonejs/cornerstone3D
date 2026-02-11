import {
  convertRGBColorByPixel,
  convertRGBColorByPlane,
  convertYBRFullByPixel,
  convertYBRFull422ByPixel,
  convertYBRFullByPlane,
  convertPaletteColor,
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

export default function convertColorSpace(imageFrame, colorBuffer, useRGBA) {
  const { photometricInterpretation: pmi } = imageFrame;
  // convert based on the photometric interpretation
  if (imageFrame.photometricInterpretation === 'RGB') {
    convertRGB(imageFrame, colorBuffer, useRGBA);
  } else if (
    pmi === 'YBR_RCT' ||
    pmi === 'YBR_ICT' ||
    pmi === 'YBR_PARTIAL_420'
  ) {
    // According to: https://dicom.nema.org/medical/dicom/current/output/html/part05.html#sect_8.2
    // color by plane is not permitted for these PMI values, AND the
    // uncompressed version isn't allowed, so fall back to RGB by pixel
    // for those cases.
    convertRGBColorByPixel(imageFrame.pixelData, colorBuffer, useRGBA);
  } else if (imageFrame.photometricInterpretation === 'PALETTE COLOR') {
    convertPaletteColor(imageFrame, colorBuffer, useRGBA);
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
