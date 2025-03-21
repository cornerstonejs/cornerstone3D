import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

/**
 * Creates a fill strategy that uses the isWithinThreshold created by the
 * createIsInThreshold and the bounds specified in the boundsIJK to go over
 * the specified area, checking if in threshold, and if so, filling that area
 * with the new segment by calling the setValue function.
 */
export default {
  [StrategyCallbacks.Fill]: (operationData: InitializedOperationData) => {
    const {
      segmentsLocked,
      segmentationImageData,
      segmentationVoxelManager,
      brushStrategy,
      centerIJK,
    } = operationData;
    const isWithinThreshold =
      brushStrategy.createIsInThreshold?.(operationData);
    const { setValue } = brushStrategy;

    const callback = isWithinThreshold
      ? (data) => {
          const { value, index } = data;
          if (segmentsLocked.includes(value) || !isWithinThreshold(index)) {
            return;
          }
          setValue(operationData, data);
        }
      : (data) => setValue(operationData, data);

    segmentationVoxelManager.forEach(callback, {
      imageData: segmentationImageData,
      isInObject: operationData.isInObject,
      boundsIJK: operationData.isInObjectBoundsIJK,
    });

    segmentationVoxelManager.addPoint(centerIJK);
  },
};
