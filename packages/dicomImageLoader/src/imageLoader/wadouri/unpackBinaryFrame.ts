/* eslint no-bitwise: 0 */

import { ByteArray } from 'dicom-parser';

function isBitSet(byte: number, bitPos: number) {
  return byte & (1 << bitPos);
}

/**
 * Function to deal with unpacking a binary frame
 */
function unpackBinaryFrame(
  byteArray: ByteArray,
  frameOffset: number,
  pixelsPerFrame: number
): Uint8Array {
  // Create a new pixel array given the image size
  const pixelData = new Uint8Array(pixelsPerFrame);

  for (let i = 0; i < pixelsPerFrame; i++) {
    // Compute byte position
    const bytePos = Math.floor(i / 8);

    // Get the current byte
    const byte = byteArray[bytePos + frameOffset];

    // Bit position (0-7) within byte
    const bitPos = i % 8;

    // Check whether bit at bitpos is set
    pixelData[i] = isBitSet(byte, bitPos) ? 1 : 0;
  }

  return pixelData;
}

export default unpackBinaryFrame;
