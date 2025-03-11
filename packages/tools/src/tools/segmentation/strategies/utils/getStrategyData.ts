import {
  BaseVolumeViewport,
  cache,
  Enums,
  eventTarget,
  type Types,
} from '@cornerstonejs/core';
import type {
  LabelmapToolOperationDataStack,
  LabelmapToolOperationDataVolume,
} from '../../../../types';
import { getCurrentLabelmapImageIdForViewport } from '../../../../stateManagement/segmentation/segmentationState';
import { getLabelmapActorEntry } from '../../../../stateManagement/segmentation/helpers';
import { getReferenceVolumeForSegmentationVolume } from '../../../../utilities/segmentation/getReferenceVolumeForSegmentationVolume';

/**
 * Get strategy data for volume viewport
 * @param operationData - The operation data containing volumeId and referencedVolumeId
 * @returns The strategy data for volume viewport or null if error
 */
function getStrategyDataForVolumeViewport({ operationData }) {
  const { volumeId } = operationData;

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
  const imageVolume = getReferenceVolumeForSegmentationVolume(volumeId);

  if (!segmentationVolume || !imageVolume) {
    return null;
  }

  const { imageData: segmentationImageData } = segmentationVolume;
  const { voxelManager: segmentationVoxelManager } = segmentationVolume;
  const { voxelManager: imageVoxelManager, imageData } = imageVolume;

  return {
    segmentationImageData,
    segmentationVoxelManager,
    segmentationScalarData: null,
    imageScalarData: null,
    imageVoxelManager,
    imageData,
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

  let segmentationImageData;
  let segmentationVoxelManager;
  let segmentationScalarData;
  let imageScalarData;
  let imageVoxelManager;
  let imageData;
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
    const labelmapImageId = getCurrentLabelmapImageIdForViewport(
      viewport.id,
      segmentationId
    );
    if (!labelmapImageId) {
      return null;
    }
    const actorEntry = getLabelmapActorEntry(viewport.id, segmentationId);

    if (!actorEntry) {
      return null;
    }
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
    imageData = operationData.imageData;
  } else {
    const currentImageId = viewport.getCurrentImageId();
    if (!currentImageId) {
      return null;
    }

    const image = cache.getImage(currentImageId);
    imageData = image ? null : viewport.getImageData();

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
    imageData,
  };
}

/**
 * Get strategy data based on viewport type
 * @param params - Object containing operationData and viewport
 * @returns The strategy data or null if error
 */
function getStrategyData({
  operationData,
  viewport,
  strategy,
}: {
  operationData:
    | LabelmapToolOperationDataStack
    | LabelmapToolOperationDataVolume;
  viewport?: Types.IStackViewport | Types.IVolumeViewport;
  strategy: unknown;
}) {
  if (
    ('volumeId' in operationData && operationData.volumeId != null) ||
    ('referencedVolumeId' in operationData &&
      operationData.referencedVolumeId != null)
  ) {
    return getStrategyDataForVolumeViewport({ operationData });
  }

  return getStrategyDataForStackViewport({ operationData, viewport, strategy });
}

export { getStrategyData };
