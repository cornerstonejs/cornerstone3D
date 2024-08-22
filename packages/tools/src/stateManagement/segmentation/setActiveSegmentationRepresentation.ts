import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationRepresentationModified } from './triggerSegmentationEvents';

/**
 * Sets the segmentation representation as active for the specified viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns
 */
export function setActiveSegmentationRepresentation(
  viewportId: string,
  segmentationRepresentationUID: string,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.setActiveSegmentationRepresentation(
    viewportId,
    segmentationRepresentationUID
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(segmentationRepresentationUID);
  }
}
