import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import { getSegmentationRepresentations } from '../../../stateManagement/segmentation/segmentationState';
import { ToolGroupSpecificRepresentation } from '../../../types/SegmentationStateTypes';
import { getUniqueSegmentIndices } from '../../../utilities/segmentation';
import { triggerSegmentationRepresentationModified } from '../triggerSegmentationEvents';

/**
 * Set the visibility of a segmentation representation for a given tool group. It fires
 * a SEGMENTATION_REPRESENTATION_MODIFIED event. Visibility true will show all segments
 * and visibility false will hide all segments"
 *
 * @triggers SEGMENTATION_REPRESENTATION_MODIFIED
 * @param toolGroupId - The Id of the tool group that contains the segmentation.
 * @param segmentationRepresentationUID - The id of the segmentation representation to modify its visibility.
 * @param visibility - boolean
 */
function setSegmentationVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  visibility: boolean
): void {
  const toolGroupSegmentationRepresentations =
    getSegmentationRepresentations(toolGroupId);

  if (!toolGroupSegmentationRepresentations) {
    return;
  }

  const representation = toolGroupSegmentationRepresentations.find(
    (representation: ToolGroupSpecificRepresentation) =>
      representation.segmentationRepresentationUID ===
      segmentationRepresentationUID
  );

  if (!representation) {
    return;
  }

  const { segmentsHidden, segmentationId } = representation;

  const indices = getUniqueSegmentIndices(segmentationId);

  // if visibility is set to be true, we need to remove all the segments
  // from the segmentsHidden set, otherwise we need to add all the segments
  // to the segmentsHidden set
  if (visibility) {
    segmentsHidden.clear();
  } else {
    indices.forEach((index) => {
      segmentsHidden.add(index);
    });
  }

  triggerSegmentationRepresentationModified(
    toolGroupId,
    representation.segmentationRepresentationUID
  );
}

/**
 * Get the visibility of a segmentation data for a given tool group.
 *
 * @param toolGroupId - The Id of the tool group that the segmentation
 * data belongs to.
 * @param segmentationRepresentationUID - The id of the segmentation data to get
 * @returns A boolean value that indicates whether the segmentation data is visible or
 * not on the toolGroup
 */
function getSegmentationVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string
): boolean | undefined {
  const toolGroupSegmentationRepresentations =
    getSegmentationRepresentations(toolGroupId);

  const representation = toolGroupSegmentationRepresentations.find(
    (representation: ToolGroupSpecificRepresentation) =>
      representation.segmentationRepresentationUID ===
      segmentationRepresentationUID
  );

  if (!representation) {
    return;
  }

  const { segmentsHidden, segmentationId } = representation;
  const indices = getUniqueSegmentIndices(segmentationId);

  // Create a set that contains all segments indices
  const indicesSet = new Set(indices);

  // Remove a indices that are hidden
  segmentsHidden.forEach((segmentIndex) => indicesSet.delete(segmentIndex));

  // Check if there is at least one segment visible
  return !!indicesSet.size;
}

/**
 * Set the visibility of the given segment indices to the given visibility. This
 * is a helper to set the visibility of multiple segments at once and reduces
 * the number of events fired.
 *
 * @param toolGroupId -  The tool group id of the segmentation representation.
 * @param segmentationRepresentationUID -  The UID of the segmentation
 * representation.
 * @param segmentIndices -  The indices of the segments to be hidden/shown.
 * @param visibility -  The visibility to set the segments to.
 *
 */
function setSegmentsVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndices: number[],
  visibility: boolean
): void {
  const segRepresentation =
    SegmentationState.getSegmentationRepresentationByUID(
      toolGroupId,
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

  triggerSegmentationRepresentationModified(
    toolGroupId,
    segmentationRepresentationUID
  );
}

/**
 * @param toolGroupId - The Id of the tool group that contains the segmentation
 * @param segmentationRepresentationUID - The id of the segmentation representation that contains the segment
 * @param segmentIndex - Index of the segment that will be updated
 * @param visibility - True to show the segment or false to hide it
 * @returns True if the segment is visible or false otherwise
 */
function setSegmentVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number,
  visibility: boolean
): void {
  const segRepresentation =
    SegmentationState.getSegmentationRepresentationByUID(
      toolGroupId,
      segmentationRepresentationUID
    );

  if (!segRepresentation) {
    return;
  }

  visibility
    ? segRepresentation.segmentsHidden.delete(segmentIndex)
    : segRepresentation.segmentsHidden.add(segmentIndex);

  triggerSegmentationRepresentationModified(
    toolGroupId,
    segmentationRepresentationUID
  );
}

/**
 * @param toolGroupId - The Id of the tool group that contains the segmentation.
 * @param segmentationRepresentationUID - The id of the segmentation representation to modify its visibility.
 * @param segmentIndex - Index of the segment
 * @returns True if the segment is visible or false otherwise
 */
function getSegmentVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number
): boolean {
  const segRepresentation =
    SegmentationState.getSegmentationRepresentationByUID(
      toolGroupId,
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
