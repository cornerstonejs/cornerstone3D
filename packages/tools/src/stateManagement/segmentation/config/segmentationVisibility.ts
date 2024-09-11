import { getSegmentationRepresentation } from '../getSegmentationRepresentation';
import { setSegmentationRepresentationVisibility as _setSegmentationRepresentationVisibility } from '../setSegmentationRepresentationVisibility';
import { getSegmentationRepresentationVisibility as _getSegmentationRepresentationVisibility } from '../getSegmentationRepresentationVisibility';
import type { SegmentationRepresentations } from '../../../enums';
import { triggerSegmentationModified } from '../triggerSegmentationEvents';

/**
 * Sets the visibility of a segmentation representation for a given viewport.
 * It fires a SEGMENTATION_REPRESENTATION_MODIFIED event. Visibility true will show all segments
 * and visibility false will hide all segments.
 *
 * @param viewportId - The ID of the viewport that contains the segmentation.
 * @param segmentationId - The ID of the segmentation to modify its visibility.
 * @param representationType - The type of segmentation representation.
 * @param visibility - The visibility state to set (true for visible, false for hidden).
 *
 * @fires SEGMENTATION_REPRESENTATION_MODIFIED
 */
function setSegmentationRepresentationVisibility(
  viewportId: string,
  segmentationId: string,
  representationType: SegmentationRepresentations,
  visibility: boolean
): void {
  const representation = getSegmentationRepresentation(
    viewportId,
    segmentationId,
    representationType
  );

  if (!representation) {
    return;
  }

  _setSegmentationRepresentationVisibility(
    viewportId,
    representation.segmentationId,
    representation.type,
    visibility
  );

  triggerSegmentationModified(segmentationId);
}

/**
 * Gets the visibility of a segmentation representation for a given viewport.
 *
 * @param viewportId - The ID of the viewport that the segmentation representation belongs to.
 * @param segmentationId - The ID of the segmentation to get visibility for.
 * @param representationType - The type of segmentation representation.
 * @returns The visibility state of the segmentation representation, or undefined if not found.
 */
function getSegmentationRepresentationVisibility(
  viewportId: string,
  segmentationId: string,
  representationType: SegmentationRepresentations
): boolean | undefined {
  return _getSegmentationRepresentationVisibility(
    viewportId,
    segmentationId,
    representationType
  );
}

/**
 * Sets the visibility of multiple segments for a specific viewport and segmentation representation.
 *
 * @param viewport - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param representationType - The type of segmentation representation.
 * @param segmentIndices - An array of segment indices to modify.
 * @param visibility - The visibility state to set for the segments.
 */
function setSegmentIndicesVisibility(
  viewport: string,
  segmentationId: string,
  representationType: SegmentationRepresentations,
  segmentIndices: number[],
  visibility: boolean
): void {
  const hiddenSegments = getHiddenSegmentIndices(
    viewport,
    segmentationId,
    representationType
  );

  segmentIndices.forEach((segmentIndex) => {
    visibility
      ? hiddenSegments.delete(segmentIndex)
      : hiddenSegments.add(segmentIndex);
  });

  triggerSegmentationModified(segmentationId);
}

/**
 * Sets the visibility of a single segment for a specific viewport and segmentation representation.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param representationType - The type of segmentation representation.
 * @param segmentIndex - The index of the segment to modify.
 * @param visibility - The visibility status to set for the segment.
 */
function setSegmentIndexVisibility(
  viewportId: string,
  segmentationId: string,
  representationType: SegmentationRepresentations,
  segmentIndex: number,
  visibility: boolean
): void {
  const hiddenSegments = getHiddenSegmentIndices(
    viewportId,
    segmentationId,
    representationType
  );

  visibility
    ? hiddenSegments.delete(segmentIndex)
    : hiddenSegments.add(segmentIndex);

  triggerSegmentationModified(segmentationId);
}

/**
 * Retrieves the visibility of a specific segment for a given viewport and segmentation representation.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param representationType - The type of segmentation representation.
 * @param segmentIndex - The index of the segment to check.
 * @returns True if the segment is visible, false otherwise.
 */
function getSegmentIndexVisibility(
  viewportId: string,
  segmentationId: string,
  representationType: SegmentationRepresentations,
  segmentIndex: number
): boolean {
  const hiddenSegments = getHiddenSegmentIndices(
    viewportId,
    segmentationId,
    representationType
  );

  return !hiddenSegments.has(segmentIndex);
}

/**
 * Retrieves the set of hidden segments for a specific viewport and segmentation representation.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param representationType - The type of segmentation representation.
 * @returns A set of numbers representing the hidden segments.
 */
function getHiddenSegmentIndices(
  viewportId: string,
  segmentationId: string,
  representationType: SegmentationRepresentations
): Set<number> {
  const representation = getSegmentationRepresentation(
    viewportId,
    segmentationId,
    representationType
  );

  if (!representation) {
    return new Set();
  }

  return representation.segmentsHidden ?? new Set();
}

export {
  setSegmentationRepresentationVisibility,
  getSegmentationRepresentationVisibility,
  setSegmentIndicesVisibility,
  setSegmentIndexVisibility,
  getSegmentIndexVisibility,
  getHiddenSegmentIndices,
};
