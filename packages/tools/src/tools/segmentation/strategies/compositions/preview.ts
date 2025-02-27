import type { Types } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/events/triggerSegmentationDataModified';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import {
  getSegmentIndexColor,
  setSegmentIndexColor,
} from '../../../../stateManagement/segmentation/config/segmentationColor';
import { getViewportIdsWithSegmentation } from '../../../../stateManagement/segmentation/getViewportIdsWithSegmentation';

function lightenColor(r, g, b, a, factor = 0.4) {
  return [
    Math.round(r + (255 - r) * factor),
    Math.round(g + (255 - g) * factor),
    Math.round(b + (255 - b) * factor),
    a,
  ];
}

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
    const { previewColors, configuration, enabledElement } = operationData;

    if (!previewColors || !configuration) {
      return;
    }

    // Clean up old preview data
    if (operationData.preview) {
      delete operationData.preview;
    }

    delete configuration.centerSegmentIndex;

    // Now generate a normal preview as though the user had clicked, filled, released
    this.onInteractionStart?.(enabledElement, operationData);

    const preview = this.fill(enabledElement, operationData);
    if (preview) {
      preview.isPreviewFromHover = true;
      operationData.preview = preview;
      this.onInteractionEnd?.(enabledElement, operationData);
    }

    return preview;
  },

  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const {
      segmentIndex,
      previewSegmentIndex,
      previewColors,
      preview,
      segmentationId,
      segmentationVoxelManager,
    } = operationData;

    if (previewColors === undefined || !previewSegmentIndex) {
      operationData.memo = operationData.createMemo(
        segmentationId,
        segmentationVoxelManager
      );
      return;
    }

    if (preview) {
      preview.previewVoxelManager.sourceVoxelManager =
        operationData.segmentationVoxelManager;
      // And use the preview data associated with this tracking object as needed
      operationData.previewVoxelManager = preview.previewVoxelManager;
    }

    if (segmentIndex === null) {
      // Null means to reset the value, so we don't change the preview colour,
      return;
    }

    const configColor = previewColors?.[segmentIndex];
    const segmentColor = getSegmentIndexColor(
      operationData.viewport.id,
      operationData.segmentationId,
      segmentIndex
    );

    if (!configColor && !segmentColor) {
      return;
    }

    const previewColor = configColor || lightenColor(...segmentColor);

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
      segmentationVoxelManager,
      previewVoxelManager: previewVoxelManager,
      previewSegmentIndex,
      segmentationId,
      preview,
    } = operationData || {};
    if (previewSegmentIndex === undefined) {
      return;
    }

    const segmentIndex = preview?.segmentIndex ?? operationData.segmentIndex;
    if (!previewVoxelManager || previewVoxelManager.modifiedSlices.size === 0) {
      return;
    }

    // TODO - figure out a better option for undo/redo of preview
    const memo = operationData.createMemo(
      segmentationId,
      segmentationVoxelManager
    );
    operationData.memo = memo;
    const { voxelManager } = memo;

    const callback = ({ index, value }) => {
      const oldValue = segmentationVoxelManager.getAtIndex(index);
      if (oldValue === previewSegmentIndex) {
        // First restore the segmentation voxel manager
        segmentationVoxelManager.setAtIndex(index, value);
        // Then set it to the final value so that the memo voxel manager has
        // the correct values.
        voxelManager.setAtIndex(index, segmentIndex);
      }
    };
    previewVoxelManager.forEach(callback, {});

    triggerSegmentationDataModified(
      operationData.segmentationId,
      previewVoxelManager.getArrayOfModifiedSlices(),
      preview.segmentIndex
    );
    previewVoxelManager.clear();
  },

  [StrategyCallbacks.RejectPreview]: (
    operationData: InitializedOperationData
  ) => {
    const {
      previewVoxelManager: previewVoxelManager,
      segmentationVoxelManager,
    } = operationData;
    if (previewVoxelManager.modifiedSlices.size === 0) {
      return;
    }

    const callback = ({ index, value }) => {
      segmentationVoxelManager.setAtIndex(index, value);
    };
    previewVoxelManager.forEach(callback);

    // Primarily rejects back to zero, so use 0 as the segment index - even
    // if sometimes it modifies the data to other values on reject.
    triggerSegmentationDataModified(
      operationData.segmentationId,
      previewVoxelManager.getArrayOfModifiedSlices(),
      0
    );
    previewVoxelManager.clear();
  },
};
