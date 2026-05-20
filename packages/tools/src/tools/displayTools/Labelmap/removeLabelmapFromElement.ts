import { getEnabledElement } from '@cornerstonejs/core';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';

/**
 * Remove the labelmap segmentation representation from the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param element - The element that the segmentation is being added to.
 * @param segmentationId - The id of the segmentation to remove.
 *
 * @internal
 */
function removeLabelmapFromElement(
  element: HTMLDivElement,
  segmentationId: string
): void {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  const actorEntries = getLabelmapActorEntries(viewport.id, segmentationId);
  if (actorEntries?.length) {
    viewport.removeActors(actorEntries.map((entry) => entry.uid));
  }
}

export default removeLabelmapFromElement;
