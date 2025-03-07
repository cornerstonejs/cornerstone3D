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
    const { imageVoxelManager, segmentIndex, configuration } = operationData;

    if (!configuration || !segmentIndex) {
      return;
    }

    return (index) => {
      const voxelValue = imageVoxelManager.getAtIndex(index);
      const gray = Array.isArray(voxelValue)
        ? vec3.length(voxelValue as Types.Point3)
        : voxelValue;

      const { threshold } = configuration || {};

      if (!threshold?.range?.length) {
        return true;
      }
      return threshold.range[0] <= gray && gray <= threshold.range[1];
    };
  },
};
