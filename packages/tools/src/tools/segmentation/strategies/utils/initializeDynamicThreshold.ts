import type { InitializedOperationData } from '../BrushStrategy';
import type BoundsIJK from '../../../../types/BoundsIJK';

/**
 * Initializes the threshold values for the dynamic threshold.
 * If the threshold is undefined/null, the threshold will be set
 * by looking at the area centered on the centerIJK, with a delta radius,
 * and taking the range of those pixel values.
 * If the threshold is already set, then the range will be extended by just the
 * center voxel at centerIJK.
 */
export default {
  createInitialized: (enabled, operationData: InitializedOperationData) => {
    const {
      centerIJK,
      strategySpecificConfiguration,
      segmentationVoxelValue,
      imageVoxelValue,
    } = operationData;
    const { THRESHOLD } = strategySpecificConfiguration;

    if (!THRESHOLD?.isDynamic) {
      return;
    }

    const { boundsIJK } = segmentationVoxelValue;
    const { threshold: oldThreshold, delta = 0 } = THRESHOLD;
    const useDelta = oldThreshold ? 0 : delta;
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
    imageVoxelValue.forEach(callback, { boundsIJK: nestedBounds });

    operationData.strategySpecificConfiguration.THRESHOLD.threshold = threshold;
  },
  // Setup a clear threshold value on mouse/touch down
  initDown: (enabled, operationData: InitializedOperationData) => {
    const { strategySpecificConfiguration } = operationData;
    if (!strategySpecificConfiguration?.THRESHOLD?.isDynamic) {
      return;
    }
    strategySpecificConfiguration.THRESHOLD.threshold = null;
  },
};
