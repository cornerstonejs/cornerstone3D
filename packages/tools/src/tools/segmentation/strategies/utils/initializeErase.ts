import type { InitializedOperationData } from '../BrushStrategy';

/**
 * Sets up a preview to use an alternate set of colours.  First fills the
 * preview segment index with the final one for all pixels, then resets
 * the preview colours.
 */
export default {
  createInitialized: (enabled, operationData: InitializedOperationData) => {
    console.log(
      'initializeErase',
      operationData.previewSegmentIndex,
      operationData.segmentIndex
    );
    operationData.segmentIndex = 0;
    operationData.previewSegmentIndex = null;
  },
};
