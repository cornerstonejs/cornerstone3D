import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationRepresentationRemoved } from './triggerSegmentationEvents';

/**
 * Remove a segmentation representation from the segmentation state manager.
 * It fires SEGMENTATION_REPRESENTATION_REMOVED event.
 *
 * @triggers SEGMENTATION_REPRESENTATION_REMOVED
 *
 * @param segmentationRepresentationUID - The uid of the segmentation representation to remove.
 */
export function removeRepresentation(
  segmentationRepresentationUID: string,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.removeRepresentation(segmentationRepresentationUID);

  if (!suppressEvents) {
    triggerSegmentationRepresentationRemoved(segmentationRepresentationUID);
  }
}
