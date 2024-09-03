import type { Types } from '@cornerstonejs/core';
import {
  getEnabledElement,
  addVolumesToViewports,
  addImageSlicesToViewports,
  Enums,
  cache,
  BaseVolumeViewport,
  volumeLoader,
  utilities,
} from '@cornerstonejs/core';
import type {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../types/LabelmapTypes';
import { getSegmentationRepresentation } from '../../../stateManagement/segmentation/getSegmentationRepresentation';
import { getCurrentLabelmapImageIdForViewport } from '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';

const { uuidv4 } = utilities;

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

  if (viewport instanceof BaseVolumeViewport) {
    // assume labelMapData is a LabelmapSegmentationDataVolume
    const volumeLabelMapData = labelMapData as LabelmapSegmentationDataVolume;

    let volumeId = volumeLabelMapData.volumeId;

    if (!volumeId) {
      volumeId = uuidv4();

      // update the labelmap data with the new volumeId
      const segmentationRepresentation = getSegmentationRepresentation(
        segmentationRepresentationUID
      );

      const segmentation = getSegmentation(
        segmentationRepresentation.segmentationId
      );

      segmentation.representationData.Labelmap = {
        ...segmentation.representationData.Labelmap,
        volumeId,
      };
    }

    // Todo: Right now we use MIP blend mode for the labelmap, since the
    // composite blend mode has a non linear behavior regarding fill and line
    // opacity. This should be changed to a custom labelmap blendMode which does
    // what composite does, but with a linear behavior.
    if (!cache.getVolume(volumeId)) {
      await _handleMissingVolume(labelMapData);
    }

    const volumeInputs: Types.IVolumeInput[] = [
      {
        volumeId,
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
    const representation = getSegmentationRepresentation(
      segmentationRepresentationUID
    );
    // We can use the current imageId in the viewport to get the segmentation imageId
    // which later is used to create the actor and mapper.
    const segmentationImageId = getCurrentLabelmapImageIdForViewport(
      viewport.id,
      representation.segmentationId
    );

    const stackInputs: Types.IStackInput[] = [
      {
        imageId: segmentationImageId,
        actorUID: segmentationRepresentationUID,
      },
    ];

    // Add labelmap volumes to the viewports to be be rendered, but not force the render
    await addImageSlicesToViewports(renderingEngine, stackInputs, [viewportId]);
  }
}

async function _handleMissingVolume(labelMapData: LabelmapSegmentationData) {
  // since this is a labelmap which we don't have volume data for yet, we need
  // to see if there is imageIds and create one for it
  const stackData = labelMapData as LabelmapSegmentationDataStack;
  const hasImageIds = stackData.imageIds.length > 0;

  if (!hasImageIds) {
    throw new Error(
      'cannot create labelmap, no imageIds found for the volume labelmap'
    );
  }

  const volume = await volumeLoader.createAndCacheVolumeFromImages(
    (labelMapData as LabelmapSegmentationDataVolume).volumeId || uuidv4(),
    stackData.imageIds
  );

  return volume;
}

export default addLabelmapToElement;
