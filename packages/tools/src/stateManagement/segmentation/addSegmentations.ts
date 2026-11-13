import type { SegmentationPublicInput } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationModified } from './triggerSegmentationEvents';
import normalizeSegmentationInput from './helpers/normalizeSegmentationInput';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'stateManagement.segmentation.addSegmentations'
);

/**
 * It takes a segmentation input and adds it to the segmentation state manager.
 * An input whose segmentationId already exists in the state is skipped with a
 * warning, and no events are triggered for it.
 * @param segmentationInputArray - The segmentations to add.
 * @param suppressEvents - If true, the event will not be triggered.
 */
export function addSegmentations(
  segmentationInputArray: SegmentationPublicInput[],
  suppressEvents?: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;

  segmentationInputArray.forEach((segmentationInput) => {
    const { segmentationId } = segmentationInput;
    if (segmentationStateManager.getSegmentation(segmentationId)) {
      cs3dLogger.warn(
        `Segmentation with id ${segmentationId} already exists, skipping`
      );
      return;
    }

    const segmentation = normalizeSegmentationInput(segmentationInput);

    segmentationStateManager.addSegmentation(segmentation);

    if (!suppressEvents) {
      triggerSegmentationModified(segmentation.segmentationId);
    }
  });
}

export default addSegmentations;
