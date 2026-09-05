import type { ScalingParameters } from '../types';
import { getScalingMode } from './getScalingMode';

/**
 * True if the applied scaling can produce non-integer output (needs Float32).
 * Only inspects parameters used by the current modality. See #2706.
 */
export const hasFloatScalingParameters = (
  scalingParameters: ScalingParameters
): boolean => {
  const { rescaleSlope, rescaleIntercept, doseGridScaling, suvbw } =
    scalingParameters;
  const isFloat = (value: unknown): boolean =>
    typeof value === 'number' && !Number.isInteger(value);

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
};
