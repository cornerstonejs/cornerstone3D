import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import { forEachBrushFillVoxel } from '../utils/brushVoxelSlab';

/**
 * Creates a fill strategy that uses the isWithinThreshold created by the
 * createIsInThreshold and the bounds specified in the boundsIJK to go over
 * the specified area, checking if in threshold, and if so, filling that area
 * with the new segment by calling the setValue function.
 *
 * When `operationData.brushVoxelSlabFill` is present, the voxels come from the
 * shared voxel slab iterator, which walks the brush shape itself rather than
 * the axis-aligned IJK bounding box around it. See
 * `strategies/utils/brushVoxelSlab.ts`. A strategy that builds no fill - a
 * degenerate brush, or one that has not moved onto the shared iterator yet -
 * falls back to the bounding-box walk.
 */
export default {
  [StrategyCallbacks.Fill]: (operationData: InitializedOperationData) => {
    const {
      segmentsLocked,
      segmentationImageData,
      segmentationVoxelManager,
      brushStrategy,
      centerIJK,
      brushVoxelSlabFill,
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

    if (brushVoxelSlabFill) {
      forEachBrushFillVoxel(
        brushVoxelSlabFill,
        segmentationVoxelManager,
        callback
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
