import type { InitializedOperationData } from '../BrushStrategy';

/**
 * Sets up tracking for use by preview and other services.
 * The tracking is either the preview object, or the previewVoxelValue.
 * Re-using this existing preview means that the same segment colour and already
 * tracked values can be extended.
 */
export default {
  createInitialized: (
    enabledElement,
    operationData: InitializedOperationData
  ) => {
    const { preview } = operationData;
    if (!preview) {
      return;
    }
    preview.previewVoxelValue.sourceVoxelValue =
      operationData.segmentationVoxelValue;
    // And use the preview data associated with this tracking object as needed
    operationData.previewVoxelValue = preview.previewVoxelValue;
    // Use the same segment index unless we are clearing the segment index values
    if (operationData.segmentIndex !== null) {
      operationData.segmentIndex = preview.segmentIndex;
    }
  },
};
