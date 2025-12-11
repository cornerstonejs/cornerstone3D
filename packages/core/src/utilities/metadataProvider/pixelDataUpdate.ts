/**
 * Converts the palette data information into
 * an array when it is present as an array buffer.
 */

import { MetadataModules } from '../../enums';
import { addTypedProvider } from '../../metaData';

/**
 * Converts pixel data to the appropriate array type
 */
export function pixelDataUpdate(next, query, data, options) {
  const basePixelData = next(query, data, options);
  if (!basePixelData) {
    return basePixelData;
  }
  const result = { ...basePixelData };
  const {
    redPaletteColorLookupTableData,
    greenPaletteColorLookupTableData,
    bluePaletteColorLookupTableData,
    pixelPaddingValue,
    pixelPaddingRangeLimit,
    pixelRepresentation,
  } = basePixelData;

  const { redPaletteColorLookupTableDescriptor } = basePixelData;
  if (redPaletteColorLookupTableData instanceof ArrayBuffer) {
    const tableLen = redPaletteColorLookupTableDescriptor[0] || 65536;
    if (tableLen === redPaletteColorLookupTableData.byteLength) {
      result.redPaletteColorLookupTableData = new Uint8Array(
        redPaletteColorLookupTableData
      );
      result.greenPaletteColorLookupTableData = new Uint8Array(
        greenPaletteColorLookupTableData
      );
      result.bluePaletteColorLookupTableData = new Uint8Array(
        bluePaletteColorLookupTableData
      );
    } else {
      result.redPaletteColorLookupTableData = new Uint16Array(
        redPaletteColorLookupTableData
      );
      result.greenPaletteColorLookupTableData = new Uint16Array(
        greenPaletteColorLookupTableData
      );
      result.bluePaletteColorLookupTableData = new Uint16Array(
        bluePaletteColorLookupTableData
      );
    }
  }

  if (pixelRepresentation == 1) {
    if (pixelPaddingValue < 0) {
      result.pixelPaddingValue = pixelPaddingValue & 0xffff;
    }
    if (pixelPaddingRangeLimit < 0) {
      result.pixelPaddingValue = pixelPaddingRangeLimit & 0xffff;
    }
    const { smallestPixelValue, largestPixelValue } = result;
    if (smallestPixelValue < 0) {
      result.smallestPixelValue = smallestPixelValue & 0xffff;
    }
    if (largestPixelValue < 0) {
      result.largestPixelValue = largestPixelValue & 0xffff;
    }
  }

  return result;
}

addTypedProvider(MetadataModules.IMAGE_PIXEL, pixelDataUpdate);
