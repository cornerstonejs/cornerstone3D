import type { Types } from '@cornerstonejs/core';

export default function scaleArray(
  array: Types.PixelDataTypedArray,
  scalingParameters
): boolean {
  const arrayLength = array.length;
  const { rescaleSlope, rescaleIntercept, suvbw } = scalingParameters;

  if (
    scalingParameters.modality === 'PT' &&
    typeof suvbw === 'number' &&
    !isNaN(suvbw)
  ) {
    for (let i = 0; i < arrayLength; i++) {
      array[i] = suvbw * (array[i] * rescaleSlope + rescaleIntercept);
    }
  } else {
    for (let i = 0; i < arrayLength; i++) {
      array[i] = array[i] * rescaleSlope + rescaleIntercept;
    }
  }

  return true;
}
