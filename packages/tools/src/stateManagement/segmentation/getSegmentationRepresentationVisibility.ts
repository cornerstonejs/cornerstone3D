import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Returns the visibility of a segmentation representation in a specific viewport.
 * @param viewportId - The ID of the viewport.
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns The visibility of the segmentation representation in the viewport.
 */
export function getSegmentationRepresentationVisibility(
  viewportId: string,
  segmentationRepresentationUID: string
): boolean {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getSegmentationRepresentationVisibility(
    viewportId,
    segmentationRepresentationUID
  );
}
