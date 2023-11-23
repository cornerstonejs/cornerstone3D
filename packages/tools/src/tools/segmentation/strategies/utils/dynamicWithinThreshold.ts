import type { InitializedOperationData } from '../BrushStrategy';
import type BoundsIJK from '../../../../types/BoundsIJK';
import { pointInShapeCallback } from '../../../../utilities';

export default function dynamicWithinThreshold(
  operationData: InitializedOperationData
) {
  const { boundsIJK, centerIJK, strategySpecificConfiguration } = operationData;
  const { THRESHOLD } = strategySpecificConfiguration;

  if (!THRESHOLD?.isDynamic) {
    return;
  }

  // Setup a clear threshold value on mouse/touch down
  operationData.initDown = () => {
    THRESHOLD.threshold = null;
  };

  const { threshold: oldThreshold } = THRESHOLD;
  const nestedBounds = boundsIJK.map((ijk, idx) => {
    const [min, max] = ijk;
    return [Math.max(min, centerIJK[idx]), Math.min(max, centerIJK[idx])];
  }) as BoundsIJK;

  const threshold = oldThreshold || [Infinity, -Infinity];
  const callback = ({ value, pointIJK }) => {
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
