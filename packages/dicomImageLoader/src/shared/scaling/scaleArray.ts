import type { Types } from '@cornerstonejs/core';

export default function scaleArray(
  array: Types.PixelDataTypedArray,
  scalingParameters
): boolean {
  const arrayLength = array.length;
  const { rescaleSlope, rescaleIntercept, suvbw, doseGridScaling } =
    scalingParameters;

  if (
    scalingParameters.modality === 'PT' &&
    typeof suvbw === 'number' &&
    !isNaN(suvbw)
  ) {
    for (let i = 0; i < arrayLength; i++) {
      array[i] = suvbw * (array[i] * rescaleSlope + rescaleIntercept);
    }
  } else if (
    scalingParameters.modality === 'RTDOSE' &&
    typeof doseGridScaling === 'number' &&
    !isNaN(doseGridScaling)
  ) {
    for (let i = 0; i < arrayLength; i++) {
      array[i] = array[i] * doseGridScaling;
    }
  } else {
    for (let i = 0; i < arrayLength; i++) {
      array[i] = array[i] * rescaleSlope + rescaleIntercept;
    }
  }

  return true;
}
