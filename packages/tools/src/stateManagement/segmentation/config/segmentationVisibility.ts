import { triggerSegmentationRepresentationModified } from '../triggerSegmentationEvents';
import { getSegmentationRepresentations } from '../../../stateManagement/segmentation/segmentationState';
import { ToolGroupSpecificRepresentation } from '../../../types/SegmentationStateTypes';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';

/**
 * Set the visibility of a segmentation representation for a given tool group. It fires
 * a SEGMENTATION_REPRESENTATION_MODIFIED event.
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

  toolGroupSegmentationRepresentations.forEach(
    (representation: ToolGroupSpecificRepresentation) => {
      if (
        representation.segmentationRepresentationUID ===
        segmentationRepresentationUID
      ) {
        representation.visibility = visibility;
        triggerSegmentationRepresentationModified(
          toolGroupId,
          representation.segmentationRepresentationUID
        );
      }
    }
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
  const toolGroupSegRepresentations =
    getSegmentationRepresentations(toolGroupId);

  const segmentationData = toolGroupSegRepresentations.find(
    (representation: ToolGroupSpecificRepresentation) =>
      representation.segmentationRepresentationUID ===
      segmentationRepresentationUID
  );

  if (!segmentationData) {
    return;
  }

  return segmentationData.visibility;
}

function setVisibilityForSegmentIndex(
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

  if (visibility) {
    segRepresentation.segmentsHidden.delete(segmentIndex);
  } else {
    segRepresentation.segmentsHidden.add(segmentIndex);
  }

  triggerSegmentationRepresentationModified(
    toolGroupId,
    segmentationRepresentationUID
  );
}

export {
  setSegmentationVisibility,
  getSegmentationVisibility,
  setVisibilityForSegmentIndex,
};
