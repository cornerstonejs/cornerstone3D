import type { Types } from '@cornerstonejs/core';

export type ScalingMode = 'PT_SUV' | 'RTDOSE' | 'RESCALE' | 'NONE';

/**
 * Which modality-specific scaling transform is applied to the pixel data.
 * Single source of truth for scaleArray and _calculateScaledMinMax.
 */
export function getScalingMode(
  scalingParameters: Types.ScalingParameters
): ScalingMode {
  const { rescaleSlope, rescaleIntercept, modality, doseGridScaling, suvbw } =
    scalingParameters;

  if (modality === 'PT' && typeof suvbw === 'number' && !isNaN(suvbw)) {
    return 'PT_SUV';
  }
  if (
    modality === 'RTDOSE' &&
    typeof doseGridScaling === 'number' &&
    !isNaN(doseGridScaling)
  ) {
    return 'RTDOSE';
  }
  if (typeof rescaleSlope === 'number' && typeof rescaleIntercept === 'number') {
    return 'RESCALE';
  }
  return 'NONE';
}

/**
 * True if the applied scaling can produce non-integer output (needs Float32).
 * Only inspects parameters used by the current modality. See #2706.
 */
export function hasNonIntegerScaling(
  scalingParameters: Types.ScalingParameters
): boolean {
  const { rescaleSlope, rescaleIntercept, doseGridScaling, suvbw } =
    scalingParameters;
  const isFloat = (v: unknown): boolean =>
    typeof v === 'number' && !Number.isInteger(v);

  switch (getScalingMode(scalingParameters)) {
    case 'PT_SUV':
      return (
        isFloat(suvbw) || isFloat(rescaleSlope) || isFloat(rescaleIntercept)
      );
    case 'RTDOSE':
      return isFloat(doseGridScaling);
    case 'RESCALE':
      return isFloat(rescaleSlope) || isFloat(rescaleIntercept);
    default:
      return false;
  }
}
