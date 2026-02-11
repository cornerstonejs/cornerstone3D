import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';
import { metaData } from '@cornerstonejs/core';

/**
 * Fetches the palette color lookup table data for a given color (red, green, or blue) from the image frame.
 * If the data is not present on the image frame, it attempts to fetch it from the metadata store.
 * @param imageFrame - The image frame containing palette information
 * @param color - The color channel to fetch ('red', 'green', or 'blue')
 * @param fallback - Value to return if palette data is not found
 * @returns Promise resolving to the palette color lookup table data or fallback value
 */
export function fetchPaletteData(
  imageFrame: Types.IImageFrame,
  color: 'red' | 'green' | 'blue',
  fallback
) {
  const data = imageFrame[`${color}PaletteColorLookupTableData`];
  if (data) {
    return Promise.resolve(data);
  }

  const result = metaData.get('imagePixelModule', imageFrame.imageId);

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
export default function convertPALETTECOLOR(
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
export async function convertPALETTECOLORWithFetch(
  imageFrame: Types.IImageFrame,
  colorBuffer: ByteArray,
  useRGBA: boolean
): Promise<void> {
  // Fetch palette data if not already loaded
  const [redData, greenData, blueData] = await Promise.all([
    fetchPaletteData(imageFrame, 'red', null),
    fetchPaletteData(imageFrame, 'green', null),
    fetchPaletteData(imageFrame, 'blue', null),
  ]);

  // Attach palette data to imageFrame
  imageFrame.redPaletteColorLookupTableData = redData;
  imageFrame.greenPaletteColorLookupTableData = greenData;
  imageFrame.bluePaletteColorLookupTableData = blueData;

  // Call the synchronous conversion function
  convertPALETTECOLOR(imageFrame, colorBuffer, useRGBA);
}
