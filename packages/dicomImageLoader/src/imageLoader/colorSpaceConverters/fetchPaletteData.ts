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
