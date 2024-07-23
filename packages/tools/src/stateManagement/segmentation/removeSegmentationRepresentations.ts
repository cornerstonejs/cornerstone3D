import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import { labelmapDisplay } from '../../tools/displayTools/Labelmap';
import { contourDisplay } from '../../tools/displayTools/Contour';

import { getSegmentationRepresentation } from './segmentationState';

/**
 * Remove the segmentation representation (representation) from the viewports of the toolGroup.
 * @param toolGroupId - The Id of the toolGroup to remove the segmentation from.
 * @param segmentationRepresentationUIDs - The UIDs of the segmentation representations to remove.
 * @param immediate - if True the viewport will be re-rendered immediately.
 */
function removeSegmentationRepresentations(
  viewportId: string,
  segmentationRepresentationUIDs?: string[] | undefined,
  immediate?: boolean
): void {
  if (!segmentationRepresentationUIDs) {
    return;
  }

  segmentationRepresentationUIDs.forEach((segmentationDataUID) => {
    _removeRepresentation(viewportId, segmentationDataUID, immediate);
  });
}

function _removeRepresentation(
  viewportId,
  segmentationRepresentationUID: string,
  immediate?: boolean
): void {
  const segmentationRepresentation = getSegmentationRepresentation(
    segmentationRepresentationUID
  );

  const { type } = segmentationRepresentation;

  if (type === SegmentationRepresentations.Labelmap) {
    labelmapDisplay.removeRepresentation(
      viewportId,
      segmentationRepresentationUID,
      immediate
    );
  } else if (type === SegmentationRepresentations.Contour) {
    contourDisplay.removeRepresentation(
      viewportId,
      segmentationRepresentationUID,
      immediate
    );
  } else {
    throw new Error(`The representation ${type} is not supported yet`);
  }
}

export default removeSegmentationRepresentations;
