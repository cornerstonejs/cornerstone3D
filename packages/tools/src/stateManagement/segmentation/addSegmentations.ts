import type { SegmentationPublicInput } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationModified } from './triggerSegmentationEvents';
import normalizeSegmentationInput from './helpers/normalizeSegmentationInput';

/**
 * It takes a segmentation input and adds it to the segmentation state manager
 * @param segmentationInput - The segmentation to add.
 * @param suppressEvents - If true, the event will not be triggered.
 */
export function addSegmentations(
  segmentationInputArray: SegmentationPublicInput[],
  suppressEvents?: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;

  segmentationInputArray.forEach((segmentationInput) => {
    const segmentation = normalizeSegmentationInput(segmentationInput);

    segmentationStateManager.addSegmentation(segmentation);

    if (!suppressEvents) {
      triggerSegmentationModified(segmentation.segmentationId);
    }
  });
}

export default addSegmentations;
