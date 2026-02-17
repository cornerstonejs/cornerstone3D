import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';
import { fetchLUTForInstance } from './fetchLUTForInstance';

function convertLUTto8Bit(lut: number[], shift: number) {
  const numEntries = lut.length;
  const cleanedLUT = new Uint8ClampedArray(numEntries);

  for (let i = 0; i < numEntries; ++i) {
    cleanedLUT[i] = lut[i] >> shift;
  }

  return cleanedLUT;
}

/**
 * Convert pixel data with PALETTE COLOR Photometric Interpretation to RGB/RGBA
 * Note: Palette bulkdata must be loaded on the imageFrame before calling this function
 *
 * @param imageFrame - The ImageFrame to convert (must have palette data loaded)
 * @param colorBuffer - The buffer to write the converted pixel data to
 * @param useRGBA - Whether to output RGBA (true) or RGB (false)
 * @returns
 */
export default function convertPaletteColor(
  imageFrame: Types.IImageFrame,
  colorBuffer: ByteArray,
  useRGBA: boolean
): void {
  const numPixels = imageFrame.columns * imageFrame.rows;
  const pixelData = imageFrame.pixelData;

  const rData = imageFrame.redPaletteColorLookupTableData;
  const gData = imageFrame.greenPaletteColorLookupTableData;
  const bData = imageFrame.bluePaletteColorLookupTableData;

  if (!rData || !gData || !bData) {
    throw new Error(
      'The image does not have a complete color palette. R, G, and B palette data are required.'
    );
  }

  const len = rData.length;
  let palIndex = 0;
  let bufferIndex = 0;

  const start = imageFrame.redPaletteColorLookupTableDescriptor[1];
  const bitsStored = imageFrame.redPaletteColorLookupTableDescriptor[2];
  const shift = bitsStored > 8 || rData.some((num) => num > 255) ? 8 : 0;

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

/**
 * Convert pixel data with PALETTE COLOR Photometric Interpretation to RGB/RGBA
 * with automatic fetching of palette color lookup tables if not already loaded.
 * This is useful for users who want to convert palette color frames without
 * manually fetching the palette data first.
 *
 * @param imageFrame - The ImageFrame to convert
 * @param colorBuffer - The buffer to write the converted pixel data to
 * @param useRGBA - Whether to output RGBA (true) or RGB (false)
 * @returns Promise that resolves when conversion is complete
 */
export async function convertPaletteColorWithFetch(
  imageFrame: Types.IImageFrame,
  colorBuffer: ByteArray,
  useRGBA: boolean
): Promise<void> {
  // Fetch LUT data if needed (palette, modality, VOI)
  await fetchLUTForInstance(imageFrame);

  // Call the synchronous conversion function
  convertPaletteColor(imageFrame, colorBuffer, useRGBA);
}
