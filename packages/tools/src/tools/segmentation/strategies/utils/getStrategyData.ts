import {
  BaseVolumeViewport,
  cache,
  Enums,
  eventTarget,
} from '@cornerstonejs/core';
import type { LabelmapToolOperationDataStack } from '../../../../types';
import { getCurrentLabelmapImageIdForViewport } from '../../../../stateManagement/segmentation/segmentationState';
import { getLabelmapActorEntry } from '../../../../stateManagement/segmentation/helpers';

/**
 * Get strategy data for volume viewport
 * @param operationData - The operation data containing volumeId and referencedVolumeId
 * @returns The strategy data for volume viewport or null if error
 */
function getStrategyDataForVolumeViewport({ operationData }) {
  const { volumeId, referencedVolumeId } = operationData;

  if (!volumeId) {
    const event = new CustomEvent(Enums.Events.ERROR_EVENT, {
      detail: {
        type: 'Segmentation',
        message: 'No volume id found for the segmentation',
      },
      cancelable: true,
    });
    eventTarget.dispatchEvent(event);
    return null;
  }

  const segmentationVolume = cache.getVolume(volumeId);

  if (!segmentationVolume) {
    return null;
  }

  const segmentationVoxelManager = segmentationVolume.voxelManager;
  let imageVoxelManager;

  // we only need the referenceVolumeId if we do thresholding
  // but for other operations we don't need it so make it optional
  if (referencedVolumeId) {
    const imageVolume = cache.getVolume(referencedVolumeId);
    imageVoxelManager = imageVolume.voxelManager;
  }

  const { imageData: segmentationImageData } = segmentationVolume;

  return {
    segmentationImageData,
    segmentationScalarData: null,
    imageScalarData: null,
    segmentationVoxelManager,
    imageVoxelManager,
  };
}

/**
 * Get strategy data for stack viewport
 * @param operationData - The operation data containing segmentationId and imageId
 * @param viewport - The viewport instance
 * @returns The strategy data for stack viewport or null if error
 */
function getStrategyDataForStackViewport({
  operationData,
  viewport,
  strategy,
}) {
  const { segmentationId } = operationData as LabelmapToolOperationDataStack;

  const labelmapImageId = getCurrentLabelmapImageIdForViewport(
    viewport.id,
    segmentationId
  );
  if (!labelmapImageId) {
    return null;
  }

  const currentImageId = viewport.getCurrentImageId();
  if (!currentImageId) {
    return null;
  }

  const actorEntry = getLabelmapActorEntry(viewport.id, segmentationId);

  if (!actorEntry) {
    return null;
  }

  let segmentationImageData;
  let segmentationVoxelManager;
  let segmentationScalarData;
  let imageScalarData;
  let imageVoxelManager;

  if (strategy.ensureSegmentationVolumeFor3DManipulation) {
    // Todo: I don't know how to handle this, seems like strategies cannot return anything
    // and just manipulate the operationData?
    strategy.ensureSegmentationVolumeFor3DManipulation({
      operationData,
      viewport,
    });

    segmentationVoxelManager = operationData.segmentationVoxelManager;
    segmentationImageData = operationData.segmentationImageData;
    segmentationScalarData = null;
  } else {
    const currentSegImage = cache.getImage(labelmapImageId);
    segmentationImageData = actorEntry.actor.getMapper().getInputData();
    segmentationVoxelManager = currentSegImage.voxelManager;

    const currentSegmentationImageId = operationData.imageId;

    const segmentationImage = cache.getImage(currentSegmentationImageId);
    if (!segmentationImage) {
      return null;
    }
    segmentationScalarData = segmentationImage.getPixelData?.();
  }

  if (strategy.ensureImageVolumeFor3DManipulation) {
    strategy.ensureImageVolumeFor3DManipulation({
      operationData,
      viewport,
    });

    imageVoxelManager = operationData.imageVoxelManager;
    imageScalarData = operationData.imageScalarData;
  } else {
    const image = cache.getImage(currentImageId);
    const imageData = image ? null : viewport.getImageData();

    // VERY IMPORTANT
    // This is the pixel data of the image that is being segmented in the cache
    // and we need to use this to for the modification
    imageScalarData = image?.getPixelData() || imageData.getScalarData();
    imageVoxelManager = image?.voxelManager;
  }

  return {
    segmentationImageData,
    segmentationScalarData,
    imageScalarData,
    segmentationVoxelManager,
    imageVoxelManager,
  };
}

/**
 * Get strategy data based on viewport type
 * @param params - Object containing operationData and viewport
 * @returns The strategy data or null if error
 */
function getStrategyData({ operationData, viewport, strategy }) {
  if (viewport instanceof BaseVolumeViewport) {
    return getStrategyDataForVolumeViewport({ operationData });
  }

  return getStrategyDataForStackViewport({ operationData, viewport, strategy });
}

export { getStrategyData };
