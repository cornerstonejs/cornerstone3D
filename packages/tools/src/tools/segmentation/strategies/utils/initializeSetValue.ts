import type {
  InitializedOperationData,
  InitializerInstance,
} from '../BrushStrategy';

/**
 * Creates a set value function which will apply the specified segmentIndex
 * to the given location.
 * If segmentIndex is null, it will clear the given segment index instead
 * This is all done through the previewVoxelValue so that values can be recorded
 * as changed, and the original values remembered.
 */
export default {
  setValue: ({ value, index }, operationData: InitializedOperationData) => {
    const {
      segmentsLocked,
      segmentIndex,
      previewVoxelValue,
      previewSegmentIndex,
      segmentationVoxelValue,
    } = operationData;
    const existingValue = segmentationVoxelValue.getAtIndex(index);
    if (segmentIndex === null) {
      const oldValue = previewVoxelValue.getAtIndex(index);
      if (oldValue !== undefined) {
        previewVoxelValue.setAtIndex(index, oldValue);
      }
      return;
    }

    if (existingValue === segmentIndex || segmentsLocked.includes(value)) {
      return;
    }
    // Correct for preview data getting into the image area and not accepted/rejected
    if (existingValue === previewSegmentIndex) {
      if (previewVoxelValue.getAtIndex(index) === undefined) {
        // Reset the value to ensure preview gets added to the indices
        segmentationVoxelValue.setAtIndex(index, segmentIndex);
      } else {
        return;
      }
    }

    // Now, just update the displayed value
    const useSegmentIndex = previewSegmentIndex ?? segmentIndex;

    previewVoxelValue.setAtIndex(index, useSegmentIndex);
  },
} as InitializerInstance;
