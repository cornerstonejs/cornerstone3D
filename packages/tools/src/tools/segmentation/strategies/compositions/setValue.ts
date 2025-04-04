import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import { handleUseSegmentCenterIndex } from '../utils/handleUseSegmentCenterIndex';

/**
 * Creates a set value function which will apply the specified segmentIndex
 * to the given location.
 * If segmentIndex is null, it will clear the given segment index instead
 * This is all done through the voxelManager so that values can be recorded
 * as changed, and the original values remembered.
 */
export default {
  [StrategyCallbacks.INTERNAL_setValue]: (
    operationData: InitializedOperationData,
    { value, index }
  ) => {
    const {
      segmentsLocked,
      previewSegmentIndex,
      memo,
      segmentationVoxelManager,
      centerSegmentIndexInfo,
      segmentIndex,
    } = operationData;

    const existingValue = segmentationVoxelManager.getAtIndex(index);

    if (segmentsLocked.includes(value)) {
      return;
    }

    if (!centerSegmentIndexInfo && existingValue === segmentIndex) {
      return;
    }

    if (
      centerSegmentIndexInfo?.segmentIndex !== 0 &&
      existingValue === segmentIndex
    ) {
      return;
    }

    // this means we have previewSegmentIndex
    if (centerSegmentIndexInfo?.segmentIndex === null) {
      memo.voxelManager.setAtIndex(index, previewSegmentIndex ?? segmentIndex);
      return;
    }

    if (!previewSegmentIndex) {
      let useSegmentIndex = segmentIndex;
      if (centerSegmentIndexInfo) {
        useSegmentIndex = centerSegmentIndexInfo.segmentIndex;
      }

      memo.voxelManager.setAtIndex(index, useSegmentIndex);
      return;
    }

    // we have centerSegmentIndexInfo with preview enabled
    handleUseSegmentCenterIndex({
      operationData,
      existingValue,
      index,
    });
  },
};
