import type {
  InitializedOperationData,
  InitializerInstance,
} from '../BrushStrategy';

/**
 * Creates a set value function which will apply the specified segmentIndex
 * to the given location.
 * Uses a strategy pattern getPreviewSegmentIndex call to choose an alternate
 * segment index to use for preview colouring.
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
