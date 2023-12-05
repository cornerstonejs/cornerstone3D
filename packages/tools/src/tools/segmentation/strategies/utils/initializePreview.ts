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
    operationData.preview = preview;
    this.completeUp?.(enabledElement, operationData);
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
    } = operationData;
    if (previewSegmentIndex === undefined) {
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
      previewColor as [number, number, number, number]
    );
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

  rejectPreview: (enabledElement, operationData: InitializedOperationData) => {
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
