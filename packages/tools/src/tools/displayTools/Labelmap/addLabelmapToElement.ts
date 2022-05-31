import { getEnabledElement, addVolumesToViewports } from '@cornerstonejs/core';

/**
 * It adds a labelmap segmentation representation of the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param element - The element that will be rendered.
 * @param volumeId - The volume id of the labelmap.
 * @param segmentationRepresentationUID - The segmentation representation UID.
 *
 * @internal
 */
async function addLabelmapToElement(
  element: HTMLDivElement,
  volumeId: string,
  segmentationRepresentationUID: string
): Promise<void> {
  const enabledElement = getEnabledElement(element);
  const { renderingEngine, viewport } = enabledElement;
  const { id: viewportId } = viewport;

  // Default to true since we are setting a new segmentation, however,
  // in the event listener, we will make other segmentations visible/invisible
  // based on the config
  const visibility = true;
  const immediateRender = false;
  const suppressEvents = true;

  const volumeInputs = [
    {
      volumeId,
      actorUID: segmentationRepresentationUID,
      visibility,
    },
  ];

  // Add labelmap volumes to the viewports to be be rendered, but not force the render
  await addVolumesToViewports(
    renderingEngine,
    volumeInputs,
    [viewportId],
    immediateRender,
    suppressEvents
  );
}

export default addLabelmapToElement;
