import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

/**
 * Adds an isWithinThreshold to the operation data that checks that the
 * image value is within threshold[0]...threshold[1]
 * No-op if threshold not defined.
 */
export default {
  [StrategyCallbacks.createIsInThreshold]: (
    operationData: InitializedOperationData
  ) => {
    const {
      imageVoxelManager: imageVoxelManager,
      strategySpecificConfiguration,
      segmentIndex,
    } = operationData;
    if (!strategySpecificConfiguration || !segmentIndex) {
      return;
    }
    return (index) => {
      const { THRESHOLD, THRESHOLD_INSIDE_CIRCLE } =
        strategySpecificConfiguration;

      const voxelValue = imageVoxelManager.getAtIndex(index);
      // Prefer the generic version of the THRESHOLD configuration, but fallback
      // to the older THRESHOLD_INSIDE_CIRCLE version.
      const { threshold } = THRESHOLD || THRESHOLD_INSIDE_CIRCLE || {};
      if (!threshold?.length) {
        return true;
      }
      return threshold[0] <= voxelValue && voxelValue <= threshold[1];
    };
  },
};
