import type { OperationData, InitializedOperationData } from '../BrushStrategy';

/**
 * Sets up tracking for use by preview and other services.
 * This sets up a  TRACKING value in the strategy specific configuration which
 * stores the original value for updated pixels, and allows the changes to be
 * applied (eg for a preview), reverted, or acted on in other ways.
 */
export default {
  createInitialized: (enabled, operationData: InitializedOperationData) => {
    const { preview } = operationData;
    if (!preview) {
      return;
    }
    preview.sourceVoxelValue = operationData.segmentationVoxelValue;
    // And use the preview data associated with this tracking object as needed
    operationData.previewVoxelValue = preview;
  },
};
