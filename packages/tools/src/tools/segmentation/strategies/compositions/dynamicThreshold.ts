import { vec3 } from 'gl-matrix';
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
      operationName,
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
    if (
      operationName === StrategyCallbacks.RejectPreview ||
      operationName === StrategyCallbacks.OnInteractionEnd
    ) {
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
    // TODO - threshold on all three values separately
    const callback = ({ value }) => {
      const gray = Array.isArray(value) ? vec3.len(value as any) : value;
      threshold[0] = Math.min(gray, threshold[0]);
      threshold[1] = Math.max(gray, threshold[1]);
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
