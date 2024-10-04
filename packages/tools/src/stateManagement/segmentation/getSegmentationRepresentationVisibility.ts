import type { SegmentationRepresentations } from '../../enums';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Returns the visibility of a segmentation representation in a specific viewport.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param type - The type of the segmentation representation.
 * @returns The visibility of the segmentation representation in the viewport.
 */
export function getSegmentationRepresentationVisibility(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  }
): boolean {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getSegmentationRepresentationVisibility(
    viewportId,
    specifier
  );
}
