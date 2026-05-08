import type { Types } from '@cornerstonejs/core';
import { metaData } from '@cornerstonejs/core';
import { fetchPaletteData } from './fetchPaletteData';

/**
 * Fetches all necessary LUT data (palette, modality, VOI) for an image instance if not already loaded.
 * This function only returns a promise if there is actual LUT data to fetch from metadata.
 * TODO : Extend this to modality and VOI LUT fetching as needed.
 *
 * @param imageFrame - The ImageFrame to fetch LUT data for
 * @returns Promise that resolves when all LUT data is fetched, or void if no fetching needed
 */
export async function fetchLUTForInstance(
  imageFrame: Types.IImageFrame
): Promise<void> | null {
  const fetchPromises = [];

  // Check if palette color LUTs need to be fetched
  const needsPaletteLUT =
    !imageFrame.redPaletteColorLookupTableData ||
    !imageFrame.greenPaletteColorLookupTableData ||
    !imageFrame.bluePaletteColorLookupTableData;

  if (needsPaletteLUT) {
    // Fetch palette data if not already loaded
    const palettePromises = Promise.all([
      fetchPaletteData(imageFrame, 'red', null),
      fetchPaletteData(imageFrame, 'green', null),
      fetchPaletteData(imageFrame, 'blue', null),
    ]).then(([redData, greenData, blueData]) => {
      // Attach palette data to imageFrame
      imageFrame.redPaletteColorLookupTableData = redData;
      imageFrame.greenPaletteColorLookupTableData = greenData;
      imageFrame.bluePaletteColorLookupTableData = blueData;
    });

    fetchPromises.push(palettePromises);
  }

  // Only await if there are promises to fetch
  if (fetchPromises.length > 0) {
    await Promise.all(fetchPromises);
  }
}
