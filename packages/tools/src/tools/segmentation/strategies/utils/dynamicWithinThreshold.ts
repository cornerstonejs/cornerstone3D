import type { InitializedOperationData } from '../BrushStrategy';
import type BoundsIJK from '../../../../types/BoundsIJK';
import { pointInShapeCallback } from '../../../../utilities';

export default function dynamicWithinThreshold(
  operationData: InitializedOperationData
) {
  const { boundsIJK, centerIJK, strategySpecificConfiguration } = operationData;
  const { THRESHOLD } = strategySpecificConfiguration;

  if (!THRESHOLD?.isDynamic || !boundsIJK) {
    return;
  }

  const { initDown } = operationData;
  // Setup a clear threshold value on mouse/touch down
  operationData.initDown = () => {
    THRESHOLD.threshold = null;
    initDown?.();
  };

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
  pointInShapeCallback(
    operationData.imageVolume.imageData,
    () => true,
    callback,
    nestedBounds
  );

  operationData.strategySpecificConfiguration.THRESHOLD.threshold = threshold;
}
