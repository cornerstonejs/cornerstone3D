import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';
import external from '../../externalModules';

function convertLUTto8Bit(lut: number[], shift: number) {
  const numEntries = lut.length;
  const cleanedLUT = new Uint8ClampedArray(numEntries);

  for (let i = 0; i < numEntries; ++i) {
    cleanedLUT[i] = lut[i] >> shift;
  }

  return cleanedLUT;
}

function fetchPaletteData(imageFrame, color, fallback) {
  const data = imageFrame[`${color}PaletteColorLookupTableData`];
  if (data) {
    return Promise.resolve(data);
  }

  const result = external.cornerstone.metaData.get(
    'imagePixelModule',
    imageFrame.imageId
  );

  if (result && typeof result.then === 'function') {
    return result.then((module) =>
      module ? module[`${color}PaletteColorLookupTableData`] : fallback
    );
  } else {
    return Promise.resolve(
      result ? result[`${color}PaletteColorLookupTableData`] : fallback
    );
  }
}

/**
 * Convert pixel data with PALETTE COLOR Photometric Interpretation to RGBA
 *
 * @param imageFrame - The ImageFrame to convert
 * @param colorBuffer - The buffer to write the converted pixel data to
 * @returns
 */
export default function (
  imageFrame: Types.IImageFrame,
  colorBuffer: ByteArray,
  useRGBA: boolean
): void {
  const numPixels = imageFrame.columns * imageFrame.rows;
  const pixelData = imageFrame.pixelData;

  Promise.all([
    fetchPaletteData(imageFrame, 'red', null),
    fetchPaletteData(imageFrame, 'green', null),
    fetchPaletteData(imageFrame, 'blue', null),
  ]).then(([rData, gData, bData]) => {
    if (!rData || !gData || !bData) {
      throw new Error(
        'The image does not have a complete color palette. R, G, and B palette data are required.'
      );
    }

    const len = rData.length;
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
  });
}
