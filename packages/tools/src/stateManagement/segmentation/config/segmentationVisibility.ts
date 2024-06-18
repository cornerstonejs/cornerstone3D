import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import { triggerSegmentationRepresentationModified } from '../triggerSegmentationEvents';

/**
 * Set the visibility of a segmentation representation for a given viewport. It fires
 * a SEGMENTATION_REPRESENTATION_MODIFIED event. Visibility true will show all segments
 * and visibility false will hide all segments"
 *
 * @triggers SEGMENTATION_REPRESENTATION_MODIFIED
 * @param viewportId - The Id of the viewport that contains the segmentation.
 * @param segmentationRepresentationUID - The id of the segmentation representation to modify its visibility.
 * @param visibility - boolean
 */
function setSegmentationVisibility(
  viewportId: string,
  segmentationRepresentationUID: string,
  visibility: boolean
): void {
  const representation = SegmentationState.getSegmentationRepresentationByUID(
    segmentationRepresentationUID
  );

  if (!representation) {
    return;
  }

  SegmentationState.setSegmentationRepresentationVisibility(
    viewportId,
    segmentationRepresentationUID,
    visibility
  );

  triggerSegmentationRepresentationModified(segmentationRepresentationUID);
}

/**
 * Get the visibility of a segmentation representation for a given viewport.
 *
 * @param viewportId - The Id of the viewport that the segmentation
 * representation belongs to.
 * @param segmentationRepresentationUID - The id of the segmentation representation to get
 * @returns A boolean value that indicates whether the segmentation representation is visible or
 * not on the viewport
 */
function getSegmentationVisibility(
  viewportId: string,
  segmentationRepresentationUID: string
): boolean | undefined {
  return SegmentationState.getSegmentationRepresentationVisibility(
    viewportId,
    segmentationRepresentationUID
  );
}

/**
 * Set the visibility of the given segment indices to the given visibility. This
 * is a helper to set the visibility of multiple segments at once and reduces
 * the number of events fired.
 *
 * @param segmentationRepresentationUID -  The UID of the segmentation
 * representation.
 * @param segmentIndices -  The indices of the segments to be hidden/shown.
 * @param visibility -  The visibility to set the segments to.
 *
 */
function setSegmentsVisibility(
  segmentationRepresentationUID: string,
  segmentIndices: number[],
  visibility: boolean
): void {
  const segRepresentation =
    SegmentationState.getSegmentationRepresentationByUID(
      segmentationRepresentationUID
    );

  if (!segRepresentation) {
    return;
  }

  segmentIndices.forEach((segmentIndex) => {
    visibility
      ? segRepresentation.segmentsHidden.delete(segmentIndex)
      : segRepresentation.segmentsHidden.add(segmentIndex);
  });

  triggerSegmentationRepresentationModified(segmentationRepresentationUID);
}

/**
 * @param segmentationRepresentationUID - The id of the segmentation representation that contains the segment
 * @param segmentIndex - Index of the segment that will be updated
 * @param visibility - True to show the segment or false to hide it
 * @returns True if the segment is visible or false otherwise
 */
function setSegmentVisibility(
  segmentationRepresentationUID: string,
  segmentIndex: number,
  visibility: boolean
): void {
  const segRepresentation =
    SegmentationState.getSegmentationRepresentationByUID(
      segmentationRepresentationUID
    );

  if (!segRepresentation) {
    return;
  }

  visibility
    ? segRepresentation.segmentsHidden.delete(segmentIndex)
    : segRepresentation.segmentsHidden.add(segmentIndex);

  triggerSegmentationRepresentationModified(segmentationRepresentationUID);
}

/**
 * @param segmentationRepresentationUID - The id of the segmentation representation to modify its visibility.
 * @param segmentIndex - Index of the segment
 * @returns True if the segment is visible or false otherwise
 */
function getSegmentVisibility(
  segmentationRepresentationUID: string,
  segmentIndex: number
): boolean {
  const segRepresentation =
    SegmentationState.getSegmentationRepresentationByUID(
      segmentationRepresentationUID
    );

  if (!segRepresentation) {
    return false;
  }

  return !segRepresentation.segmentsHidden.has(segmentIndex);
}

export {
  setSegmentationVisibility,
  getSegmentationVisibility,
  setSegmentVisibility,
  setSegmentsVisibility,
  getSegmentVisibility,
};
