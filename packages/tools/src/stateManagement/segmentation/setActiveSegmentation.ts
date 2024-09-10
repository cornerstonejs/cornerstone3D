import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the active segmentation representation for a given viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @returns The active segmentation representation, or undefined if not found.
 */
export function setActiveSegmentation(
  viewportId: string,
  segmentationId: string
): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.setActiveSegmentation(viewportId, segmentationId);
}
