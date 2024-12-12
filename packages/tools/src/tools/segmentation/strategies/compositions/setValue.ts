import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

/**
 * Creates a set value function which will apply the specified segmentIndex
 * to the given location.
 * If segmentIndex is null, it will clear the given segment index instead
 * This is all done through the previewVoxelManager so that values can be recorded
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
      segmentationVoxelManager,
      memo,
    } = operationData;

    const previewVoxelManager =
      memo?.voxelManager || operationData.previewVoxelManager;

    const existingValue = segmentationVoxelManager.getAtIndex(index);

    let changed = false;
    if (segmentIndex === null) {
      const oldValue = previewVoxelManager.getAtIndex(index);
      if (oldValue !== undefined) {
        changed = previewVoxelManager.setAtIndex(index, oldValue);
      }
      return;
    }

    if (existingValue === segmentIndex || segmentsLocked.includes(value)) {
      return;
    }

    // Correct for preview data getting into the image area and not accepted/rejected
    if (existingValue === previewSegmentIndex) {
      if (previewVoxelManager.getAtIndex(index) === undefined) {
        // Reset the value to ensure preview gets added to the indices
        changed = segmentationVoxelManager.setAtIndex(index, segmentIndex);
      } else {
        return;
      }
    }

    // Now, just update the displayed value
    const useSegmentIndex = previewSegmentIndex ?? segmentIndex;
    changed = previewVoxelManager.setAtIndex(index, useSegmentIndex);
  },
};
