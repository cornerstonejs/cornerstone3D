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
 * @param element - The element that the segmentation is being added to.
 * @param segmentationRepresentationUID - The UID of the contour representation to remove.
 * @param toolGroupId - The ID of the toolGroup that the segmentationRepresentation belongs to.
 * @param removeFromCache - boolean
 *
 * @internal
 */
function removeContourFromElement(
  element: HTMLDivElement,
  segmentationRepresentationUID: string,
  toolGroupId: string,
  removeFromCache = false // Todo
): void {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  const actorEntries = (viewport as Types.IVolumeViewport).getActors();

  // remove actors whose id has the same prefix as the segmentationRepresentationUID
  const actorUIDsToRemove = actorEntries
    .map(({ uid }) =>
      uid.includes(segmentationRepresentationUID) ? uid : undefined
    )
    .filter(Boolean);

  // @ts-ignore
  viewport.removeActors(actorUIDsToRemove);

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
