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
    const existingValue = segmentationVoxelValue.getIndex(index);
    if (segmentIndex === null) {
      const oldValue = previewVoxelValue.getIndex(index);
      if (oldValue !== undefined) {
        previewVoxelValue.setIndex(index, oldValue);
      }
      return;
    }

    if (existingValue === segmentIndex || segmentsLocked.includes(value)) {
      return;
    }
    // Correct for preview data getting into the image area and not accepted/rejected
    if (existingValue === previewSegmentIndex) {
      if (previewVoxelValue.getIndex(index) === undefined) {
        // Reset the value to ensure preview gets added to the indices
        segmentationVoxelValue.setIndex(index, segmentIndex);
      } else {
        return;
      }
    }

    // Now, just update the displayed value
    const useSegmentIndex = previewSegmentIndex ?? segmentIndex;

    previewVoxelValue.setIndex(index, useSegmentIndex);
  },
} as InitializerInstance;
