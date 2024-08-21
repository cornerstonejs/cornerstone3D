import type { SegmentationPublicInput } from '../../types/SegmentationStateTypes';
import normalizeSegmentationInput from './helpers/normalizeSegmentationInput';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationModified } from './triggerSegmentationEvents';

/**
 * It takes a segmentation input and adds it to the segmentation state manager
 * @param segmentationInput - The segmentation to add.
 * @param suppressEvents - If true, the event will not be triggered.
 */
export function addSegmentation(
  segmentationInput: SegmentationPublicInput,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;

  const segmentation = normalizeSegmentationInput(segmentationInput);

  segmentationStateManager.addSegmentation(segmentation);

  if (!suppressEvents) {
    triggerSegmentationModified(segmentation.segmentationId);
  }
}
