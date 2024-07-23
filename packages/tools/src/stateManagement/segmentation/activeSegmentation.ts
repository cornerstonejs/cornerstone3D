import {
  SegmentationRepresentation,
  Segmentation,
} from '../../types/SegmentationStateTypes';
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
 * Retrieves the active segmentation for a given viewport.
 * @param viewportId - The ID of the viewport.
 * @returns The active segmentation, or null if no active segmentation is found.
 */
function getActiveSegmentation(viewportId): Segmentation {
  const activeRepresentation = getActiveSegmentationRepresentation(viewportId);

  if (!activeRepresentation) {
    return null;
  }

  return SegmentationState.getSegmentation(activeRepresentation.segmentationId);
}

/**
 * Sets the active segmentation representation for a specific viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param suppressEvent - Whether to suppress the event triggered by the change - default false.
 * @returns
 */
function setActiveRepresentation(
  viewportId,
  segmentationRepresentationUID,
  suppressEvent = false
): void {
  SegmentationState.setActiveRepresentation(
    viewportId,
    segmentationRepresentationUID,
    suppressEvent
  );
}

export {
  // get
  getActiveSegmentationRepresentation,
  getActiveSegmentation,
  // set
  setActiveRepresentation,
};
