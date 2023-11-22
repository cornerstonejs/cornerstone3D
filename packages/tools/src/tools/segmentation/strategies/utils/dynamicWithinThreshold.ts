import type { InitializedOperationData } from '../BrushStrategy';
import type BoundsIJK from '../../../../types/BoundsIJK';
import { pointInShapeCallback } from '../../../../utilities';

export default function dynamicWithinThreshold(
  operationData: InitializedOperationData
) {
  const { boundsIJK, imageData, strategySpecificConfiguration } = operationData;
  const { THRESHOLD } = strategySpecificConfiguration;

  if (!THRESHOLD?.isDynamic) {
    return;
  }
  let center = NaN;
  let numPoints = 0;

  const centerIJK = boundsIJK.map((it) => Math.round((it[0] + it[1]) / 2));
  const { threshold: oldThreshold } = THRESHOLD;

  const nestedBounds = boundsIJK.map((ijk) => {
    const [min, max] = ijk;
    const center = Math.round((min + max) / 2);
    const delta = Math.min(max - min, 1);
    return [center - delta, center + delta];
  }) as BoundsIJK;

  const threshold = oldThreshold || [Infinity, -Infinity];
  const callback = ({ value, pointIJK }) => {
    if (pointIJK.findIndex((it, idx) => it !== centerIJK[idx]) === -1) {
      center = value;
    }
    threshold[0] = Math.min(value, threshold[0]);
    threshold[1] = Math.max(value, threshold[1]);
    numPoints++;
  };
  pointInShapeCallback(
    operationData.imageVolume.imageData,
    operationData.isInObject,
    callback,
    nestedBounds
  );

  console.log('Dynamic threshold:', threshold, oldThreshold);
  operationData.strategySpecificConfiguration.THRESHOLD.threshold = threshold;
}
