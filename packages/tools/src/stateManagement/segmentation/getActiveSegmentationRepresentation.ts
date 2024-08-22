import type { SegmentationRepresentation } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the active segmentation representation for a given viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @returns The active segmentation representation, or undefined if not found.
 */
export function getActiveSegmentationRepresentation(
  viewportId: string
): SegmentationRepresentation | undefined {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getActiveSegmentationRepresentation(
    viewportId
  );
}
