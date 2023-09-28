import { ByteArray } from 'dicom-parser';
import { ImageFrame } from '../../types';
import external from '../../externalModules';

function convertLUTto8Bit(lut: number[], shift: number) {
  const numEntries = lut.length;
  const cleanedLUT = new Uint8ClampedArray(numEntries);

  for (let i = 0; i < numEntries; ++i) {
    cleanedLUT[i] = lut[i] >> shift;
  }

  return cleanedLUT;
}

/**
 * Convert pixel data with PALETTE COLOR Photometric Interpretation to RGBA
 *
 * @param imageFrame - The ImageFrame to convert
 * @param colorBuffer - The buffer to write the converted pixel data to
 * @returns
 */
export default function (
  imageFrame: ImageFrame,
  colorBuffer: ByteArray,
  useRGBA: boolean
): void {
  const numPixels = imageFrame.columns * imageFrame.rows;
  const pixelData = imageFrame.pixelData;
  let rData = imageFrame.redPaletteColorLookupTableData;

  if (!rData) {
    // request from metadata provider since it might grab it from bulkdataURI
    rData = external.cornerstone.metaData.get(
      'imagePixelModule',
      imageFrame.imageId
    )?.redPaletteColorLookupTableData;
  }

  let gData = imageFrame.greenPaletteColorLookupTableData;

  if (!gData) {
    gData = external.cornerstone.metaData.get(
      'imagePixelModule',
      imageFrame.imageId
    )?.greenPaletteColorLookupTableData;
  }

  let bData = imageFrame.bluePaletteColorLookupTableData;

  if (!bData) {
    bData = external.cornerstone.metaData.get(
      'imagePixelModule',
      imageFrame.imageId
    )?.bluePaletteColorLookupTableData;
  }

  if (!rData || !gData || !bData) {
    throw new Error(
      'The image does not have a complete color palette. R, G, and B palette data are required.'
    );
  }

  const len = imageFrame.redPaletteColorLookupTableData.length;

  let palIndex = 0;

  let bufferIndex = 0;

  const start = imageFrame.redPaletteColorLookupTableDescriptor[1];
  const shift =
    imageFrame.redPaletteColorLookupTableDescriptor[2] === 8 ? 0 : 8;

  const rDataCleaned = convertLUTto8Bit(rData, shift);
  const gDataCleaned = convertLUTto8Bit(gData, shift);
  const bDataCleaned = convertLUTto8Bit(bData, shift);

  if (useRGBA) {
    for (let i = 0; i < numPixels; ++i) {
      let value = pixelData[palIndex++];

      if (value < start) {
        value = 0;
      } else if (value > start + len - 1) {
        value = len - 1;
      } else {
        value -= start;
      }

      colorBuffer[bufferIndex++] = rDataCleaned[value];
      colorBuffer[bufferIndex++] = gDataCleaned[value];
      colorBuffer[bufferIndex++] = bDataCleaned[value];
      colorBuffer[bufferIndex++] = 255;
    }

    return;
  }

  for (let i = 0; i < numPixels; ++i) {
    let value = pixelData[palIndex++];

    if (value < start) {
      value = 0;
    } else if (value > start + len - 1) {
      value = len - 1;
    } else {
      value -= start;
    }

    colorBuffer[bufferIndex++] = rDataCleaned[value];
    colorBuffer[bufferIndex++] = gDataCleaned[value];
    colorBuffer[bufferIndex++] = bDataCleaned[value];
  }
}
