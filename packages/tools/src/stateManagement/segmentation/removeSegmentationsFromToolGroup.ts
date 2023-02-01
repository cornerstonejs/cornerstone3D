import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import { labelmapDisplay } from '../../tools/displayTools/Labelmap';

import {
  getSegmentationRepresentations,
  getSegmentationRepresentationByUID,
} from './segmentationState';

/**
 * Remove the segmentation representation (representation) from the viewports of the toolGroup.
 * @param toolGroupId - The Id of the toolGroup to remove the segmentation from.
 * @param segmentationRepresentationUIDs - The UIDs of the segmentation representations to remove.
 * @param immediate - if True the viewport will be re-rendered immediately.
 */
function removeSegmentationsFromToolGroup(
  toolGroupId: string,
  segmentationRepresentationUIDs?: string[] | undefined,
  immediate?: boolean
): void {
  const toolGroupSegRepresentations =
    getSegmentationRepresentations(toolGroupId);

  if (
    !toolGroupSegRepresentations ||
    toolGroupSegRepresentations.length === 0
  ) {
    return;
  }

  const toolGroupSegRepresentationUIDs = toolGroupSegRepresentations.map(
    (representation) => representation.segmentationRepresentationUID
  );

  let segRepresentationUIDsToRemove = segmentationRepresentationUIDs;
  if (segRepresentationUIDsToRemove) {
    // make sure the segmentationDataUIDs that are going to be removed belong
    // to the toolGroup
    const invalidSegRepresentationUIDs = segmentationRepresentationUIDs.filter(
      (segRepresentationUID) =>
        !toolGroupSegRepresentationUIDs.includes(segRepresentationUID)
    );

    if (invalidSegRepresentationUIDs.length > 0) {
      throw new Error(
        `The following segmentationRepresentationUIDs are not part of the toolGroup: ${JSON.stringify(
          invalidSegRepresentationUIDs
        )}`
      );
    }
  } else {
    // remove all segmentation representations
    segRepresentationUIDsToRemove = toolGroupSegRepresentationUIDs;
  }

  segRepresentationUIDsToRemove.forEach((segmentationDataUID) => {
    _removeSegmentation(toolGroupId, segmentationDataUID, immediate);
  });
}

function _removeSegmentation(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  immediate?: boolean
): void {
  const segmentationRepresentation = getSegmentationRepresentationByUID(
    toolGroupId,
    segmentationRepresentationUID
  );

  const { type } = segmentationRepresentation;

  if (type === SegmentationRepresentations.Labelmap) {
    labelmapDisplay.removeSegmentationRepresentation(
      toolGroupId,
      segmentationRepresentationUID,
      immediate
    );
  } else if (type === SegmentationRepresentations.Contour) {
    console.debug('Contour representation is not supported yet, ignoring...');
  } else {
    throw new Error(`The representation ${type} is not supported yet`);
  }
}

export default removeSegmentationsFromToolGroup;
