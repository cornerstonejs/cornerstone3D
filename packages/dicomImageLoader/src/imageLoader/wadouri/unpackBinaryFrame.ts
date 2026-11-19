/* eslint no-bitwise: 0 */

import type { ByteArray } from 'dicom-parser';

function isBitSet(byte: number, bitPos: number) {
  return byte & (1 << bitPos);
}

/**
 * Function to deal with unpacking a binary frame
 *
 * @param byteArray - The bit packed pixel data
 * @param frameOffset - Byte offset of the byte holding the first pixel
 * @param pixelsPerFrame - Number of pixels (bits) to unpack
 * @param bitOffset - Bit (0-7) within the `frameOffset` byte that holds the
 * first pixel. Frames are packed back to back (PS3.5 8.1.1), so a frame whose
 * pixel count is not a multiple of 8 makes the next one start mid byte.
 */
function unpackBinaryFrame(
  byteArray: ByteArray,
  frameOffset: number,
  pixelsPerFrame: number,
  bitOffset = 0
): Uint8Array {
  // Create a new pixel array given the image size
  const pixelData = new Uint8Array(pixelsPerFrame);

  for (let i = 0; i < pixelsPerFrame; i++) {
    // Bit index relative to the start of the frameOffset byte
    const bitIndex = i + bitOffset;

    // Compute byte position
    const bytePos = Math.floor(bitIndex / 8);

    // Get the current byte
    const byte = byteArray[bytePos + frameOffset];

    // Bit position (0-7) within byte
    const bitPos = bitIndex % 8;

    // Check whether bit at bitpos is set
    pixelData[i] = isBitSet(byte, bitPos) ? 1 : 0;
  }

  return pixelData;
}

export default unpackBinaryFrame;
