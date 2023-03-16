export default function scaleArray(
  array:
    | Uint8Array
    | Float32Array
    | Int16Array
    | Uint16Array
    | Uint8ClampedArray,
  scalingParameters
): boolean {
  const arrayLength = array.length;
  const { rescaleSlope, rescaleIntercept, suvbw } = scalingParameters;

  if (scalingParameters.modality === 'PT' && typeof suvbw === 'number') {
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
