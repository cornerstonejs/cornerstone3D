import {
  type Types,
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
import { getCurrentLabelmapImageIdForViewport } from '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import {
  triggerSegmentationDataModified,
  triggerSegmentationModified,
} from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { SegmentationRepresentations } from '../../../enums';
import { addVolumesAsIndependentComponents } from './addVolumesAsIndependentComponents';
import type { LabelmapRenderingConfig } from '../../../types/SegmentationStateTypes';

const { uuidv4 } = utilities;

/**
 * It adds a labelmap segmentation representation of the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param element - The element that will be rendered.
 * @param labelMapData - The labelmap segmentation data.
 * @param segmentationId - The segmentation id of the labelmap.
 *
 * @internal
 */
async function addLabelmapToElement(
  element: HTMLDivElement,
  labelMapData: LabelmapSegmentationData,
  segmentationId: string,
  config: LabelmapRenderingConfig
): Promise<void | { uid: string; actor }> {
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
    const volumeLabelMapData = labelMapData as LabelmapSegmentationDataVolume;
    const volumeId = _ensureVolumeHasVolumeId(
      volumeLabelMapData,
      segmentationId
    );

    if (!cache.getVolume(volumeId)) {
      await _handleMissingVolume(labelMapData);
    }

    let blendMode =
      config?.blendMode ?? Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;

    let useIndependentComponents =
      blendMode === Enums.BlendModes.LABELMAP_EDGE_PROJECTION_BLEND;

    // Add dimension check before deciding to use independent components
    if (useIndependentComponents) {
      const referenceVolumeId = viewport.getVolumeId();
      const baseVolume = cache.getVolume(referenceVolumeId);
      const segVolume = cache.getVolume(volumeId);

      const segDims = segVolume.dimensions;
      const refDims = baseVolume.dimensions;

      if (
        segDims[0] !== refDims[0] ||
        segDims[1] !== refDims[1] ||
        segDims[2] !== refDims[2]
      ) {
        // If dimensions don't match, fallback to regular volume addition
        useIndependentComponents = false;
        blendMode = Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
        console.debug(
          'Dimensions mismatch - falling back to regular volume addition'
        );
      }
    }

    const volumeInputs: Types.IVolumeInput[] = [
      {
        volumeId,
        visibility,
        representationUID: `${segmentationId}-${SegmentationRepresentations.Labelmap}`,
        useIndependentComponents,
        blendMode,
      },
    ];

    /*
     * Having independent components for the segmentation data means that we are
     * dding the segmentation as a separate component (e.g., component 2) to the
     * volume data (component 1, index 0). If the base data is color data, which
     * is an independent component itself, this approach will not work. I'm unsure what
     * a Maximum Intensity Projection (MIP) of color data would be, but it's not
     * the same as the MIP of grayscale data.
     * Another limitation is that if we have multiple segmentation volumes, we
     * cannot add them as independent components to the volume data since the current
     * logic is limited to one. The shader code needs to be updated to handle
     * multiple independent components.
     * Todo: add a check here to identify if the base data is color data and fallback
     * to the default behavior.
     */
    if (!volumeInputs[0].useIndependentComponents) {
      await addVolumesToViewports(
        renderingEngine,
        volumeInputs,
        [viewportId],
        immediateRender,
        suppressEvents
      );
    } else {
      const result = await addVolumesAsIndependentComponents({
        viewport,
        volumeInputs,
        segmentationId,
      });

      return result;
    }
  } else {
    // We can use the current imageId in the viewport to get the segmentation imageId
    // which later is used to create the actor and mapper.
    const segmentationImageId = getCurrentLabelmapImageIdForViewport(
      viewport.id,
      segmentationId
    );

    const stackInputs: Types.IStackInput[] = [
      {
        imageId: segmentationImageId,
        representationUID: `${segmentationId}-${SegmentationRepresentations.Labelmap}`,
      },
    ];

    // Add labelmap volumes to the viewports to be be rendered, but not force the render
    addImageSlicesToViewports(renderingEngine, stackInputs, [viewportId]);
  }

  // Just to make sure if the segmentation data had value before, it gets updated too
  triggerSegmentationDataModified(segmentationId);
}

/**
 * Ensures that the volume has a volumeId, generating one if necessary.
 * @param labelMapData - The labelmap segmentation data.
 * @param segmentationId - The segmentation id.
 * @returns The ensured volumeId.
 */
function _ensureVolumeHasVolumeId(
  labelMapData: LabelmapSegmentationDataVolume,
  segmentationId: string
): string {
  let { volumeId } = labelMapData;
  if (!volumeId) {
    volumeId = uuidv4();

    const segmentation = getSegmentation(segmentationId);
    segmentation.representationData.Labelmap = {
      ...segmentation.representationData.Labelmap,
      volumeId,
    };

    labelMapData.volumeId = volumeId;
    triggerSegmentationModified(segmentationId);
  }
  return volumeId;
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
