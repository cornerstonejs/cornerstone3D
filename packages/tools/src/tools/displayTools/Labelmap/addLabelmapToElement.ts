import {
  getEnabledElement,
  addVolumesToViewports,
  addImageSlicesToViewports,
  Types,
  Enums,
} from '@cornerstonejs/core';
import {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
} from '../../../types/LabelmapTypes';
import { isVolumeSegmentation } from '../../segmentation/strategies/utils/stackVolumeCheck';
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
  labelMapData: LabelmapSegmentationData,
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

  if (isVolumeSegmentation(labelMapData)) {
    // Todo: Right now we use MIP blend mode for the labelmap, since the
    // composite blend mode has a non linear behavior regarding fill and line
    // opacity. This should be changed to a custom labelmap blendMode which does
    // what composite does, but with a linear behavior.
    const volumeInputs: Types.IVolumeInput[] = [
      {
        volumeId: labelMapData.volumeId,
        actorUID: segmentationRepresentationUID,
        visibility,
        blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
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
  } else {
    const stackInputs: Types.IStackInput[] = [
      {
        imageId: (labelMapData as LabelmapSegmentationDataStack).imageIds[0],
        actorUID: segmentationRepresentationUID,
      },
    ];

    // Add labelmap volumes to the viewports to be be rendered, but not force the render
    await addImageSlicesToViewports(
      renderingEngine,
      stackInputs,
      [viewportId],
      immediateRender,
      suppressEvents
    );
  }
}

export default addLabelmapToElement;
