import type { InitializedOperationData } from '../BrushStrategy';
import type BoundsIJK from '../../../../types/BoundsIJK';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

/**
 * Initializes the threshold values for the dynamic threshold.
 * If the threshold is undefined/null, the threshold will be set
 * by looking at the area centered on the centerIJK, with a delta radius,
 * and taking the range of those pixel values.
 * If the threshold is already set, then the range will be extended by just the
 * center voxel at centerIJK.
 */
export default {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      centerIJK,
      strategySpecificConfiguration,
      segmentationVoxelManager: segmentationVoxelManager,
      imageVoxelManager: imageVoxelManager,
      segmentIndex,
    } = operationData;
    const { THRESHOLD } = strategySpecificConfiguration;

    if (!THRESHOLD?.isDynamic || !centerIJK || !segmentIndex) {
      return;
    }

    const { boundsIJK } = segmentationVoxelManager;
    const { threshold: oldThreshold, dynamicRadius = 0 } = THRESHOLD;
    const useDelta = oldThreshold ? 0 : dynamicRadius;
    const nestedBounds = boundsIJK.map((ijk, idx) => {
      const [min, max] = ijk;
      return [
        Math.max(min, centerIJK[idx] - useDelta),
        Math.min(max, centerIJK[idx] + useDelta),
      ];
    }) as BoundsIJK;

    const threshold = oldThreshold || [Infinity, -Infinity];
    const callback = ({ value }) => {
      threshold[0] = Math.min(value, threshold[0]);
      threshold[1] = Math.max(value, threshold[1]);
    };
    imageVoxelManager.forEach(callback, { boundsIJK: nestedBounds });

    operationData.strategySpecificConfiguration.THRESHOLD.threshold = threshold;
  },
  // Setup a clear threshold value on mouse/touch down
  [StrategyCallbacks.OnInteractionStart]: (
    operationData: InitializedOperationData
  ) => {
    const { strategySpecificConfiguration, preview } = operationData;
    if (!strategySpecificConfiguration?.THRESHOLD?.isDynamic && !preview) {
      return;
    }
    strategySpecificConfiguration.THRESHOLD.threshold = null;
  },
};
