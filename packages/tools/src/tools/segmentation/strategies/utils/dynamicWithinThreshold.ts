import type { InitializedOperationData } from '../BrushStrategy';
import type BoundsIJK from '../../../../types/BoundsIJK';

export default function dynamicWithinThreshold(
  operationData: InitializedOperationData
) {
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

  const { initDown } = operationData;
  // Setup a clear threshold value on mouse/touch down
  operationData.initDown = () => {
    THRESHOLD.threshold = null;
    initDown?.();
  };

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

  console.log('Computed threshold', threshold);
  operationData.strategySpecificConfiguration.THRESHOLD.threshold = threshold;
}
