import type { SegmentationRepresentations } from '../../enums';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Sets the visibility of a segmentation representation in a specific viewport.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param visible - The visibility to set for the segmentation representation in the viewport.
 */
export function setSegmentationRepresentationVisibility(
  viewportId: string,
  segmentationId: string,
  representationType: SegmentationRepresentations,
  visible: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.setSegmentationRepresentationVisibility(
    viewportId,
    segmentationId,
    representationType,
    visible
  );
}
