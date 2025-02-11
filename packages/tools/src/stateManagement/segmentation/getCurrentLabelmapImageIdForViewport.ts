import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the labelmap image IDs for a specific viewport and segmentation representation.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId -  The ID of the segmentation.
 * @returns An array of labelmap image IDs.
 */
export function getCurrentLabelmapImageIdForViewport(
  viewportId: string,
  segmentationId: string
) {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getCurrentLabelmapImageIdForViewport(
    viewportId,
    segmentationId
  );
}

export function getCurrentLabelmapImageIdForViewportOverlapping(
  viewportId: string,
  segmentationId: string
) {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getCurrentLabelmapImageIdForViewportOverlapping(
    viewportId,
    segmentationId
  );
}
