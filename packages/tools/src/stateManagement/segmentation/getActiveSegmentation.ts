import type { Segmentation } from '../../types';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the active segmentation representation for a given viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @returns The active segmentation representation, or undefined if not found.
 */
export function getActiveSegmentation(
  viewportId: string
): Segmentation | undefined {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getActiveSegmentation(viewportId);
}
