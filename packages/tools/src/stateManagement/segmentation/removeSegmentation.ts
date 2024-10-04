import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationRemoved } from './triggerSegmentationEvents';

/**
 * It removes the segmentation from the segmentation state manager
 *
 * @triggers SEGMENTATION_REMOVED
 *
 * @param segmentationId - The id of the segmentation
 */
export function removeSegmentation(segmentationId: string): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.removeSegmentation(segmentationId);
  triggerSegmentationRemoved(segmentationId);
}
