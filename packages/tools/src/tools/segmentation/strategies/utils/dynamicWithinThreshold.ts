import type { InitializedOperationData } from '../BrushStrategy';
import type BoundsIJK from '../../../../types/BoundsIJK';

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
