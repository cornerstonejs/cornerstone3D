import type { SegmentationRepresentations } from '../../enums';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Sets the visibility of a segmentation representation in a specific viewport.
 * @param viewportId - The ID of the viewport.
 * @param specifier - The specifier object containing segmentationId and type.
 * @param visible - The visibility to set for the segmentation representation in the viewport.
 */
export function setSegmentationRepresentationVisibility(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  },
  visible: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.setSegmentationRepresentationVisibility(
    viewportId,
    specifier,
    visible
  );
}
