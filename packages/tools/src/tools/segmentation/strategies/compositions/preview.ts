import { utilities, type Types } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/events/triggerSegmentationDataModified';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import { setSegmentIndexColor } from '../../../../stateManagement/segmentation/config/segmentationColor';
import { getViewportIdsWithSegmentation } from '../../../../stateManagement/segmentation/getViewportIdsWithSegmentation';

/**
 * Sets up a preview to use an alternate set of colors.  First fills the
 * preview segment index with the final one for all pixels, then resets
 * the preview colors.
 * This is only activated when the preview segment index is defined, either
 * from the initial state or from the global state.
 */
export default {
  [StrategyCallbacks.Preview]: function (
    operationData: InitializedOperationData
  ) {
    const { previewSegmentIndex, configuration, enabledElement } =
      operationData;
    if (!previewSegmentIndex || !configuration) {
      return;
    }

    delete configuration.centerSegmentIndex;

    // Now generate a normal preview as though the user had clicked, filled, released
    this.onInteractionStart?.(enabledElement, operationData);

    const preview = this.fill(enabledElement, operationData);

    if (preview) {
      // memoToUse.voxelManager.sourceVoxelManager =
      //   operationData.segmentationVoxelManager;
      this.onInteractionEnd?.(enabledElement, operationData);
    }

    return preview;
  },

  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const { segmentIndex, previewColor, previewSegmentIndex } = operationData;

    if (previewSegmentIndex == null || segmentIndex == null) {
      return;
    }

    // check if there are other viewports that are displaying the segmentationId
    // which means we should add the preview color to all of them, otherwise
    // the preview color for other viewports will be different than the viewport
    // currently we are brushing
    const viewportIds = getViewportIdsWithSegmentation(
      operationData.segmentationId
    );

    viewportIds?.forEach((viewportId) => {
      setSegmentIndexColor(
        viewportId,
        operationData.segmentationId,
        previewSegmentIndex,
        previewColor as Types.Color
      );
    });
  },

  [StrategyCallbacks.AcceptPreview]: (
    operationData: InitializedOperationData
  ) => {
    const {
      segmentIndex,
      previewSegmentIndex,
      segmentationVoxelManager,
      memo,
    } = operationData || {};

    const callback = ({ index }) => {
      const oldValue = segmentationVoxelManager.getAtIndex(index);
      if (oldValue === previewSegmentIndex) {
        memo.voxelManager.setAtIndex(index, segmentIndex);
      }
    };
    segmentationVoxelManager.forEach(callback);

    triggerSegmentationDataModified(
      operationData.segmentationId,
      segmentationVoxelManager.getArrayOfModifiedSlices(),
      segmentIndex
    );

    memo.voxelManager.clear();
  },

  [StrategyCallbacks.RejectPreview]: (
    operationData: InitializedOperationData
  ) => {
    // check if the preview has value, if not we should not undo
    // since it might be an actual brush stroke or an accept preview
    utilities.HistoryMemo.DefaultHistoryMemo.undoIf((memo) => {
      if (!memo?.voxelManager) {
        return false;
      }

      const { segmentationVoxelManager } = memo;

      let hasPreviewSegmentIndex = false;
      const callback = ({ value }) => {
        if (value === operationData.previewSegmentIndex) {
          hasPreviewSegmentIndex = true;
        }
      };

      segmentationVoxelManager.forEach(callback);

      return hasPreviewSegmentIndex;
    });
  },
};
