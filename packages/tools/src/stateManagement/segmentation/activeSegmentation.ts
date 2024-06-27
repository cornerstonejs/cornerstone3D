import { SegmentationRepresentation } from '../../types/SegmentationStateTypes';
import * as SegmentationState from './segmentationState';

/**
 * Get the active segmentation representation for viewportId
 * @param viewportId - The id of the viewport to get the active segmentation for.
 * @returns The active segmentation representation for the tool group.
 */
function getActiveSegmentationRepresentation(
  viewportId
): SegmentationRepresentation {
  return SegmentationState.getActiveSegmentationRepresentation(viewportId);
}

/**
 * Sets the active segmentation representation for a specific viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param suppressEvent - Whether to suppress the event triggered by the change - default false.
 * @returns
 */
function setActiveSegmentationRepresentation(
  viewportId,
  segmentationRepresentationUID,
  suppressEvent = false
): void {
  SegmentationState.setActiveSegmentationRepresentation(
    viewportId,
    segmentationRepresentationUID,
    suppressEvent
  );
}

export {
  // get
  getActiveSegmentationRepresentation,
  // set
  setActiveSegmentationRepresentation,
};
