import { ScalingParameters } from '../types';

/**
 * Checks if the scaling parameters contain a float rescale value.
 * @param scalingParameters - The scaling parameters to check.
 * @returns True if the scaling parameters contain a float rescale value, false otherwise.
 */
export const hasFloatScalingParameters = (
  scalingParameters: ScalingParameters
): boolean => {
  const hasFloatRescale = Object.values(scalingParameters).some(
    (value) => typeof value === 'number' && !Number.isInteger(value)
  );
  return hasFloatRescale;
};
