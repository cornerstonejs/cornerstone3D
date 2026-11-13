import type { ScalingParameters } from '../types';

export type ScalingMode = 'PT_SUV' | 'RTDOSE' | 'RESCALE' | 'NONE';

/**
 * Which modality-specific scaling transform is applied to the pixel data.
 * Mirrored in dicom-image-loader (its worker can't import core runtime); keep
 * both in sync.
 */
export function getScalingMode(
  scalingParameters: ScalingParameters
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
