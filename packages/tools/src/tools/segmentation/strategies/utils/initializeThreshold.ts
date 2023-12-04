import type { InitializedOperationData, Initializer } from '../BrushStrategy';

/**
 * Adds an isWithinThreshold to the operation data that checks that the
 * image value is within threshold[0]...threshold[1]
 * No-op if threshold not defined.
 */
export default {
  createIsInThreshold: (enabled, operationData: InitializedOperationData) => {
    const { imageVoxelValue, strategySpecificConfiguration } = operationData;
    if (!strategySpecificConfiguration) {
      return;
    }
    return (index) => {
      const { THRESHOLD, THRESHOLD_INSIDE_CIRCLE } =
        strategySpecificConfiguration;

      const voxelValue = imageVoxelValue.getIndex(index);
      // Prefer the generic version of the THRESHOLD configuration, but fallback
      // to the older THRESHOLD_INSIDE_CIRCLE version.
      const { threshold } = THRESHOLD || THRESHOLD_INSIDE_CIRCLE || {};
      if (!threshold?.length) {
        return true;
      }
      return threshold[0] <= voxelValue && voxelValue <= threshold[1];
    };
  },
} as Initializer;
