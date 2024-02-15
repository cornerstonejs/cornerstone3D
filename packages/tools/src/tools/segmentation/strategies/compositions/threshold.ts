import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

/**
 * Adds an isWithinThreshold to the operation data that checks that the
 * image value is within threshold[0]...threshold[1]
 * No-op if threshold not defined.
 */
export default {
  [StrategyCallbacks.CreateIsInThreshold]: (
    operationData: InitializedOperationData
  ) => {
    const { imageVoxelManager, strategySpecificConfiguration, segmentIndex } =
      operationData;
    if (!strategySpecificConfiguration || !segmentIndex) {
      return;
    }
    return (index) => {
      const { THRESHOLD, THRESHOLD_INSIDE_CIRCLE } =
        strategySpecificConfiguration;

      const voxelValue = imageVoxelManager.getAtIndex(index);
      const gray = Array.isArray(voxelValue)
        ? vec3.length(voxelValue as Types.Point3)
        : voxelValue;
      // Prefer the generic version of the THRESHOLD configuration, but fallback
      // to the older THRESHOLD_INSIDE_CIRCLE version.
      const { threshold } = THRESHOLD || THRESHOLD_INSIDE_CIRCLE || {};
      if (!threshold?.length) {
        return true;
      }
      return threshold[0] <= gray && gray <= threshold[1];
    };
  },
};
