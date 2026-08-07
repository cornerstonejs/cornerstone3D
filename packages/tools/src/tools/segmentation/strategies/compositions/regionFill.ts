import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import {
  forEachObliqueIntegerFillVoxel,
  isObliqueIntegerFillNonEmpty,
} from '../utils/obliqueIntegerFill';

/**
 * Creates a fill strategy that uses the isWithinThreshold created by the
 * createIsInThreshold and the bounds specified in the boundsIJK to go over
 * the specified area, checking if in threshold, and if so, filling that area
 * with the new segment by calling the setValue function.
 *
 * When `operationData.obliqueIntegerFill` is present, voxels are enumerated
 * with the integer oblique iterator (`w -> u -> v`, inner loop `ijk += B`)
 * instead of walking the axis-aligned IJK bounding box.
 */
export default {
  [StrategyCallbacks.Fill]: (operationData: InitializedOperationData) => {
    const {
      segmentsLocked,
      segmentationImageData,
      segmentationVoxelManager,
      brushStrategy,
      centerIJK,
      obliqueIntegerFill,
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

    if (
      obliqueIntegerFill &&
      isObliqueIntegerFillNonEmpty(obliqueIntegerFill)
    ) {
      forEachObliqueIntegerFillVoxel(
        obliqueIntegerFill,
        segmentationVoxelManager,
        callback,
        segmentationImageData
      );
    } else {
      segmentationVoxelManager.forEach(callback, {
        imageData: segmentationImageData,
        isInObject: operationData.isInObject,
        boundsIJK: operationData.isInObjectBoundsIJK,
      });
    }

    segmentationVoxelManager.addPoint(centerIJK);
  },
};
