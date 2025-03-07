import type { Types } from '@cornerstonejs/core';

/**
 * Removes the A from RGBA to return RGB buffer, this is used when the
 * decoding happens with browser API which results in RGBA, but if useRGBA flag
 * is set to false, we want to return RGB
 *
 * @param pixelData - decoded image in RGBA
 * @param targetBuffer - target buffer to write to
 */
function removeAFromRGBA(
  pixelData: Types.PixelDataTypedArray,
  targetBuffer: Uint8ClampedArray | Uint8Array
) {
  const numPixels = pixelData.length / 4;

  let rgbIndex = 0;

  let bufferIndex = 0;

  for (let i = 0; i < numPixels; i++) {
    targetBuffer[bufferIndex++] = pixelData[rgbIndex++]; // red
    targetBuffer[bufferIndex++] = pixelData[rgbIndex++]; // green
    targetBuffer[bufferIndex++] = pixelData[rgbIndex++]; // blue
    rgbIndex++; // skip alpha
  }

  return targetBuffer;
}

export default removeAFromRGBA;
