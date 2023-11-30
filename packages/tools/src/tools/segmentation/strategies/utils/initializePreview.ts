import type { InitializedOperationData } from '../BrushStrategy';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';

/**
 * Sets up a preview to use an alternate set of colours.  First fills the
 * preview segment index with the final one for all pixels, then resets
 * the preview colours.
 */
export default {
  createInitialized: (enabled, operationData: InitializedOperationData) => {
    if (operationData.previewSegmentIndex === operationData.segmentIndex) {
      operationData.previewSegmentIndex = null;
    }
    if (operationData.previewSegmentIndex !== undefined) {
      console.log(
        'TODO - setup colours for the preview based on',
        operationData.segmentIndex
      );
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

  rejectPreview: (enabled, operationData: InitializedOperationData) => {
    const { strategySpecificConfiguration, segmentationVoxelValue } =
      operationData;
    const tracking = strategySpecificConfiguration?.TRACKING;
    if (!tracking || tracking.modifiedSlices.size === 0) {
      return;
    }

    const callback = ({ index, value }) => {
      segmentationVoxelValue.setIndex(index, value);
    };
    tracking.forEach(callback);

    triggerSegmentationDataModified(
      operationData.segmentationId,
      tracking.getArrayOfSlices()
    );
    tracking.clear();
  },
};
