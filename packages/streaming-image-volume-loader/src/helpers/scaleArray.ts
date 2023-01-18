import type { Types } from '@cornerstonejs/core';

/**
 * Given a pixel array, rescale the pixel values using the rescale slope and
 * intercept and if modality is PT it uses the suv values to scale the array
 * @param array - The array to be scaled.
 * @param scalingParameters - The scaling parameters
 * @returns The array is being scaled
 */
export default function scaleArray(
  array: Float32Array | Uint8Array,
  scalingParameters: Types.ScalingParameters
): Float32Array | Uint8Array {
  const arrayLength = array.length;
  const { rescaleSlope, rescaleIntercept, suvbw } = scalingParameters;

  if (scalingParameters.modality === 'PT') {
    if (typeof suvbw !== 'number') {
      return array;
    }

    for (let i = 0; i < arrayLength; i++) {
      array[i] = suvbw * (array[i] * rescaleSlope + rescaleIntercept);
    }
  } else {
    for (let i = 0; i < arrayLength; i++) {
      array[i] = array[i] * rescaleSlope + rescaleIntercept;
    }
  }

  return array;
}
