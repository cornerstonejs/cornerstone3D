import type { Types } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import { config as segmentationConfig } from '../../../../stateManagement/segmentation';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

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
    const { previewColors, strategySpecificConfiguration, enabledElement } =
      operationData;
    if (!previewColors || !strategySpecificConfiguration) {
      return;
    }

    // Clean up old preview data
    if (operationData.preview) {
      delete operationData.preview;
    }
    delete strategySpecificConfiguration.centerSegmentIndex;

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
      preview.previewVoxelManager.sourceVoxelManager =
        operationData.segmentationVoxelManager;
      // And use the preview data associated with this tracking object as needed
      operationData.previewVoxelManager = preview.previewVoxelManager;
    }

    if (segmentIndex === null || !previewSegmentIndex) {
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
    const previewColor = configColor || lightenColor(...segmentColor);

    segmentationConfig.color.setColorForSegmentIndex(
      toolGroupId,
      segmentationRepresentationUID,
      previewSegmentIndex,
      previewColor as Types.Color
    );
  },

  [StrategyCallbacks.AcceptPreview]: (
    operationData: InitializedOperationData
  ) => {
    const {
      segmentationVoxelManager: segmentationVoxelManager,
      previewVoxelManager: previewVoxelManager,
      previewSegmentIndex,
      preview,
    } = operationData || {};
    if (previewSegmentIndex === undefined) {
      return;
    }
    const segmentIndex = preview?.segmentIndex ?? operationData.segmentIndex;
    const tracking = previewVoxelManager;
    if (!tracking || tracking.modifiedSlices.size === 0) {
      return;
    }

    const callback = ({ index }) => {
      const oldValue = segmentationVoxelManager.getAtIndex(index);
      if (oldValue === previewSegmentIndex) {
        segmentationVoxelManager.setAtIndex(index, segmentIndex);
      }
    };
    tracking.forEach(callback, {});

    triggerSegmentationDataModified(
      operationData.segmentationId,
      tracking.getArrayOfSlices()
    );
    tracking.clear();
  },

  [StrategyCallbacks.RejectPreview]: (
    operationData: InitializedOperationData
  ) => {
    const {
      previewVoxelManager: previewVoxelManager,
      segmentationVoxelManager: segmentationVoxelManager,
    } = operationData;
    if (previewVoxelManager.modifiedSlices.size === 0) {
      return;
    }

    const callback = ({ index, value }) => {
      segmentationVoxelManager.setAtIndex(index, value);
    };
    previewVoxelManager.forEach(callback);

    triggerSegmentationDataModified(
      operationData.segmentationId,
      previewVoxelManager.getArrayOfSlices()
    );
    previewVoxelManager.clear();
  },
};
