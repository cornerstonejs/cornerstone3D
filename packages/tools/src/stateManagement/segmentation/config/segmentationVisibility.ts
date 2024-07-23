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
function setRepresentationVisibility(
  viewportId: string,
  segmentationRepresentationUID: string,
  visibility: boolean
): void {
  const representation = SegmentationState.getSegmentationRepresentation(
    segmentationRepresentationUID
  );

  if (!representation) {
    return;
  }

  SegmentationState.setRepresentationVisibility(
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
function getSegmentationRepresentationVisibility(
  viewportId: string,
  segmentationRepresentationUID: string
): boolean | undefined {
  return SegmentationState.getSegmentationRepresentationVisibility(
    viewportId,
    segmentationRepresentationUID
  );
}

/**
 * Sets the visibility of segments for a specific viewport and segmentation representation.
 * @param viewport - The identifier of the viewport.
 * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
 * @param segmentIndices - An array of segment indices.
 * @param visibility - The visibility state to set for the segments.
 */
function setSegmentsVisibility(
  viewport: string,
  segmentationRepresentationUID: string,
  segmentIndices: number[],
  visibility: boolean
): void {
  const hiddenSegments = getSegmentsHidden(
    viewport,
    segmentationRepresentationUID
  );

  segmentIndices.forEach((segmentIndex) => {
    visibility
      ? hiddenSegments.delete(segmentIndex)
      : hiddenSegments.add(segmentIndex);
  });

  triggerSegmentationRepresentationModified(segmentationRepresentationUID);
}

/**
 * Sets the visibility of a segment for a specific viewport and segmentation representation.
 * @param viewportId - The ID of the viewport.
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param segmentIndex - The index of the segment.
 * @param visibility - The visibility status of the segment.
 */
function setSegmentIndexVisibility(
  viewportId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number,
  visibility: boolean
): void {
  const hiddenSegments = getSegmentsHidden(
    viewportId,
    segmentationRepresentationUID
  );

  visibility
    ? hiddenSegments.delete(segmentIndex)
    : hiddenSegments.add(segmentIndex);

  triggerSegmentationRepresentationModified(segmentationRepresentationUID);
}

/**
 * Determines the visibility of a segment in a specific viewport and segmentation representation.
 * @param viewportId - The ID of the viewport.
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param segmentIndex - The index of the segment.
 * @returns A boolean indicating whether the segment is visible or not.
 */
function getSegmentIndexVisibility(
  viewportId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number
): boolean {
  const hiddenSegments = getSegmentsHidden(
    viewportId,
    segmentationRepresentationUID
  );

  return !hiddenSegments.has(segmentIndex);
}

/**
 * Retrieves the set of hidden segments for a specific viewport and segmentation representation.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns A set of numbers representing the hidden segments.
 */
function getSegmentsHidden(
  viewportId: string,
  segmentationRepresentationUID: string
): Set<number> {
  const viewportRenderingState =
    SegmentationState.getAllSegmentationRepresentationsRenderingStateForViewport(
      viewportId
    );

  if (!viewportRenderingState) {
    return new Set();
  }

  return (
    viewportRenderingState[segmentationRepresentationUID]?.segmentsHidden ??
    new Set()
  );
}

export {
  setRepresentationVisibility,
  getSegmentationRepresentationVisibility,
  setSegmentsVisibility,
  setSegmentIndexVisibility,
  getSegmentIndexVisibility,
  getSegmentsHidden,
};
