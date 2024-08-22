import type { SegmentationRepresentation } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationRepresentationModified } from './triggerSegmentationEvents';

/**
 * Adds a segmentation representation to a specific viewport.
 *
 * @param viewportId - The ID of the viewport to add the representation to.
 * @param segmentationRepresentation - The segmentation representation to add.
 * @param suppressEvents - (Optional) A flag indicating whether to suppress triggering events. Defaults to false.
 */
export function addSegmentationRepresentationState(
  viewportId: string,
  segmentationRepresentation: SegmentationRepresentation,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;

  // check if the segmentation representation is already in the state
  segmentationStateManager.addSegmentationRepresentationState(
    segmentationRepresentation
  );

  segmentationStateManager.addSegmentationRepresentationToViewport(
    viewportId,
    segmentationRepresentation.segmentationRepresentationUID
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(
      segmentationRepresentation.segmentationRepresentationUID
    );
  }
}
