import { StackViewport, getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

/**
 * Remove the labelmap segmentation representation from the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param element - The element that the segmentation is being added to.
 * @param segmentationRepresentationUID - The UID of the labelmap representation to remove.
 * @param removeFromCache - boolean
 *
 * @internal
 */
function removeLabelmapFromElement(
  element: HTMLDivElement,
  segmentationRepresentationUID: string,
  removeFromCache = false // Todo
): void {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  if (viewport instanceof StackViewport) {
    // Todo: we don't have stack segmentation yet
    return;
  }

  (viewport as Types.IVolumeViewport).removeVolumeActors([
    segmentationRepresentationUID,
  ]);
}

export default removeLabelmapFromElement;
