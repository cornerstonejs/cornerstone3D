import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

/**
 * Remove the contour representation from the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param element - The element that the segmentation is being added to.
 * @param segmentationRepresentationUID - The UID of the contour representation to remove.
 * @param removeFromCache - boolean
 *
 * @internal
 */
function removeContourFromElement(
  element: HTMLDivElement,
  segmentationRepresentationUID: string,
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

  // Todo: add the logic to remove the svg contour segmentation representations as well
}

export default removeContourFromElement;
