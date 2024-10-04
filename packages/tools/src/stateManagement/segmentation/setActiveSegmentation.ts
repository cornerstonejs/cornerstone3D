import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Set the active segmentation representation for a given viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 */
export function setActiveSegmentation(
  viewportId: string,
  segmentationId: string
): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.setActiveSegmentation(viewportId, segmentationId);
}
