import { getEnabledElement } from '@cornerstonejs/core';
import { getLabelmapActorUID } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';

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

  viewport.removeActors([getLabelmapActorUID(segmentationId)]);
}

export default removeLabelmapFromElement;
