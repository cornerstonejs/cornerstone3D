import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

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
      segmentIndex,
      previewSegmentIndex,
      memo,
      segmentationVoxelManager,
    } = operationData;

    if (!memo) {
      debugger;
    }

    // const voxelManager = operationData.memo?.voxelManager;
    const segmentIndexToUse = previewSegmentIndex ?? segmentIndex;

    const existingValue = segmentationVoxelManager.getAtIndex(index);

    if (existingValue === segmentIndexToUse || segmentsLocked.includes(value)) {
      return;
    }

    memo.voxelManager.setAtIndex(index, segmentIndexToUse);
  },
};
