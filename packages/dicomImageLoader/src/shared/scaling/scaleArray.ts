import type { Types } from '@cornerstonejs/core';
import { getScalingMode } from './getScalingMode';

export default function scaleArray(
  array: Types.PixelDataTypedArray,
  scalingParameters
): boolean {
  const arrayLength = array.length;
  const { rescaleSlope, rescaleIntercept, suvbw, doseGridScaling } =
    scalingParameters;

  switch (getScalingMode(scalingParameters)) {
    case 'PT_SUV':
      for (let i = 0; i < arrayLength; i++) {
        array[i] = suvbw * (array[i] * rescaleSlope + rescaleIntercept);
      }
      break;
    case 'RTDOSE':
      for (let i = 0; i < arrayLength; i++) {
        array[i] = array[i] * doseGridScaling;
      }
      break;
    default:
      // RESCALE and NONE: linear rescale (matches prior else branch).
      for (let i = 0; i < arrayLength; i++) {
        array[i] = array[i] * rescaleSlope + rescaleIntercept;
      }
  }

  return true;
}
