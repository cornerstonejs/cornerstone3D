import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  getSegmentationRepresentationByUID,
  getSegmentation,
} from '../../../stateManagement/segmentation/segmentationState';

import { removeAnnotation } from '../../../stateManagement';

/**
 * Remove the contour representation from the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param segmentationRepresentationUID - The UID of the contour representation to remove.
 * @param toolGroupId - The ID of the toolGroup that the segmentationRepresentation belongs to.
 * @param removeFromCache - boolean
 *
 * @internal
 */
function removeContourFromElement(
  segmentationRepresentationUID: string,
  toolGroupId: string,
  removeFromCache = false // Todo
): void {
  const segmentationRepresentation = getSegmentationRepresentationByUID(
    toolGroupId,
    segmentationRepresentationUID
  );

  const { segmentationId } = segmentationRepresentation;

  const segmentation = getSegmentation(segmentationId);

  const { annotationUIDsMap } = segmentation.representationData.CONTOUR;

  annotationUIDsMap.forEach((annotationSet) => {
    annotationSet.forEach((annotationUID) => {
      removeAnnotation(annotationUID);
    });
  });
}

export default removeContourFromElement;
