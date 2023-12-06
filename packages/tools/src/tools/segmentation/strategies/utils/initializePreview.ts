import type { Types } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import { config as segmentationConfig } from '../../../../stateManagement/segmentation';

/**
 * Sets up a preview to use an alternate set of colours.  First fills the
 * preview segment index with the final one for all pixels, then resets
 * the preview colours.
 * This is only activated when the preview segment index is defined, eihter
 * from the initial state or from the global state.
 */
export default {
  preview: function (enabledElement, operationData: InitializedOperationData) {
    const { previewColors } = operationData;
    if (!previewColors) {
      return;
    }
    this.initDown?.(enabledElement, operationData);
    const preview = this.fill(enabledElement, operationData);
    if (preview) {
      preview.isPreviewFromHover = true;
      operationData.preview = preview;
      this.completeUp?.(enabledElement, operationData);
    }
    return preview;
  },

  createInitialized: (
    enabledElement,
    operationData: InitializedOperationData
  ) => {
    const {
      toolGroupId,
      segmentIndex,
      segmentationRepresentationUID,
      previewSegmentIndex,
      previewColors,
      preview,
    } = operationData;
    if (previewColors === undefined) {
      return;
    }
    if (preview) {
      preview.previewVoxelValue.sourceVoxelValue =
        operationData.segmentationVoxelValue;
      // And use the preview data associated with this tracking object as needed
      operationData.previewVoxelValue = preview.previewVoxelValue;
    }

    if (segmentIndex === null) {
      // Null means to reset the value, so we don't change the preview colour
      return;
    }

    const configColor = previewColors?.[segmentIndex];
    const segmentColor = segmentationConfig.color.getColorForSegmentIndex(
      toolGroupId,
      segmentationRepresentationUID,
      segmentIndex
    );
    if (!configColor && !segmentColor) {
      return;
    }
    const previewColor = configColor || segmentColor.map((it) => it * 0.9);
    segmentationConfig.color.setColorForSegmentIndex(
      toolGroupId,
      segmentationRepresentationUID,
      previewSegmentIndex,
      previewColor as Types.Color
    );
  },

  acceptPreview: (enabledElement, operationData: InitializedOperationData) => {
    const {
      segmentationVoxelValue,
      previewVoxelValue,
      previewSegmentIndex,
      segmentIndex,
    } = operationData;
    if (previewSegmentIndex === undefined) {
      return;
    }
    const tracking = previewVoxelValue;
    if (!tracking || tracking.modifiedSlices.size === 0) {
      return;
    }

    const callback = ({ index }) => {
      const oldValue = segmentationVoxelValue.getAtIndex(index);
      if (oldValue === previewSegmentIndex) {
        segmentationVoxelValue.setAtIndex(index, segmentIndex);
      }
    };
    tracking.forEach(callback, {});

    triggerSegmentationDataModified(
      operationData.segmentationId,
      tracking.getArrayOfSlices()
    );
    tracking.clear();
  },

  rejectPreview: (enabledElement, operationData: InitializedOperationData) => {
    const { previewVoxelValue, segmentationVoxelValue } = operationData;
    if (previewVoxelValue.modifiedSlices.size === 0) {
      return;
    }

    const callback = ({ index, value }) => {
      segmentationVoxelValue.setAtIndex(index, value);
    };
    previewVoxelValue.forEach(callback);

    triggerSegmentationDataModified(
      operationData.segmentationId,
      previewVoxelValue.getArrayOfSlices()
    );
    previewVoxelValue.clear();
  },
};
