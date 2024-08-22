import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Sets the visibility of a segmentation representation in a specific viewport.
 * @param viewportId - The ID of the viewport.
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param visible - The visibility to set for the segmentation representation in the viewport.
 */
export function setSegmentationRepresentationVisibility(
  viewportId: string,
  segmentationRepresentationUID: string,
  visible: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.setSegmentationRepresentationVisibility(
    viewportId,
    segmentationRepresentationUID,
    visible
  );
}
