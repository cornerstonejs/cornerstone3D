import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { filterSurfaceActors } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';

/**
 * Remove the surface representation from the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param element - The element that the segmentation is being added to.
 * @param segmentationId - The id of the segmentation to remove.
 *
 * @internal
 */
function removeSurfaceFromElement(
  element: HTMLDivElement,
  segmentationId: string
): void {
  const enabledElement = getEnabledElement(element);

  const { viewport } = enabledElement;

  const actorEntries = (viewport as Types.IVolumeViewport).getActors();

  const filteredSurfaceActors = filterSurfaceActors(
    actorEntries,
    segmentationId
  );

  // remove actors whose id has the same prefix as the segmentationId
  viewport.removeActors(filteredSurfaceActors.map((actor) => actor.uid));
}

export default removeSurfaceFromElement;
