// array is of type Any number array

type ScalingParameters = {
  modality: string
  rescaleSlope: number
  rescaleIntercept: number
  suvbw?: number
}

export default function scaleArray(
  array: Float32Array | Uint8Array,
  scalingParameters: ScalingParameters
): Float32Array | Uint8Array {
  const arrayLength = array.length
  const { rescaleSlope, rescaleIntercept, suvbw } = scalingParameters

  if (scalingParameters.modality === 'PT') {
    if (typeof suvbw !== 'number') {
      return
    }

    for (let i = 0; i < arrayLength; i++) {
      array[i] = suvbw * (array[i] * rescaleSlope + rescaleIntercept)
    }
  } else {
    for (let i = 0; i < arrayLength; i++) {
      array[i] = array[i] * rescaleSlope + rescaleIntercept
    }
  }

  return array
}
