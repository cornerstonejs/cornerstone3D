import type { InitializedOperationData } from '../BrushStrategy';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import { segmentIndex as segmentIndexController } from '../../../../stateManagement/segmentation';
/**
 * Sets up a preview to use an alternate set of colours.  First fills the
 * preview segment index with the final one for all pixels, then resets
 * the preview colours.
 */
export default {
  preview: function (enabled, operationData: InitializedOperationData) {
    operationData.previewSegmentIndex ??= 4;
    this.initDown?.(enabled, operationData);
    const preview = this.fill(enabled, operationData);
    operationData.preview = preview;
    this.completeUp?.(enabled, operationData);
    return preview;
  },

  createInitialized: (enabled, operationData: InitializedOperationData) => {
    const { segmentationId } = operationData;
    const previewSegmentIndex =
      segmentIndexController.getPreviewSegmentIndex(segmentationId);

    if (
      previewSegmentIndex !== undefined &&
      operationData.previewSegmentIndex === undefined
    ) {
      operationData.previewSegmentIndex = previewSegmentIndex;
    }
  },

  acceptPreview: (enabledElement, operationData: InitializedOperationData) => {
    const {
      segmentIndex,
      segmentationVoxelValue,
      previewVoxelValue,
      previewSegmentIndex,
    } = operationData;
    if (previewSegmentIndex === undefined) {
      return;
    }
    const tracking = previewVoxelValue;
    if (!tracking || tracking.modifiedSlices.size === 0) {
      return;
    }

    const callback = ({ index }) => {
      const oldValue = segmentationVoxelValue.getIndex(index);
      if (oldValue === previewSegmentIndex) {
        segmentationVoxelValue.setIndex(index, segmentIndex);
      }
    };
    tracking.forEach(callback, {});

    triggerSegmentationDataModified(
      operationData.segmentationId,
      tracking.getArrayOfSlices()
    );
    tracking.clear();
  },

  cancelPreview: (enabled, operationData: InitializedOperationData) => {
    const { previewVoxelValue, segmentationVoxelValue } = operationData;
    if (previewVoxelValue.modifiedSlices.size === 0) {
      return;
    }

    const callback = ({ index, value }) => {
      segmentationVoxelValue.setIndex(index, value);
    };
    previewVoxelValue.forEach(callback);

    triggerSegmentationDataModified(
      operationData.segmentationId,
      previewVoxelValue.getArrayOfSlices()
    );
    previewVoxelValue.clear();
  },
};
