import type { Types } from '@cornerstonejs/core';

/**
 * Removes bits outside the stored pixel field and sign extends signed values.
 */
export default function normalizeStoredPixelData(
  imageFrame: Types.IImageFrame
): void {
  const {
    bitsAllocated,
    bitsStored,
    highBit = bitsStored - 1,
    pixelData,
    pixelRepresentation,
  } = imageFrame;
  const lowBit = highBit - bitsStored + 1;

  if (
    !pixelData ||
    bitsStored <= 0 ||
    bitsStored >= 32 ||
    bitsStored > bitsAllocated ||
    lowBit < 0 ||
    highBit >= bitsAllocated ||
    (bitsStored === bitsAllocated && lowBit === 0)
  ) {
    return;
  }

  const valueRange = 2 ** bitsStored;
  const mask = valueRange - 1;
  const signBit = valueRange / 2;
  const isSigned = pixelRepresentation === 1;

  for (let i = 0; i < pixelData.length; i++) {
    const storedValue = (pixelData[i] >>> lowBit) & mask;
    pixelData[i] = storedValue;

    if (isSigned && storedValue >= signBit) {
      pixelData[i] -= valueRange;
    }
  }
}
