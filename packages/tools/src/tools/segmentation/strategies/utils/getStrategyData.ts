import {
  BaseVolumeViewport,
  cache,
  Enums,
  eventTarget,
} from '@cornerstonejs/core';
import type { LabelmapToolOperationDataStack } from '../../../../types';
import { getCurrentLabelmapImageIdForViewport } from '../../../../stateManagement/segmentation/segmentationState';
import { getLabelmapActorEntry } from '../../../../stateManagement/segmentation/helpers';

function getStrategyData({ operationData, viewport }) {
  let segmentationImageData, segmentationScalarData, imageScalarData;
  let imageVoxelManager;
  let segmentationVoxelManager;

  if (viewport instanceof BaseVolumeViewport) {
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
      return;
    }
    segmentationVoxelManager = segmentationVolume.voxelManager;

    // we only need the referenceVolumeId if we do thresholding
    // but for other operations we don't need it so make it optional
    if (referencedVolumeId) {
      const imageVolume = cache.getVolume(referencedVolumeId);
      imageVoxelManager = imageVolume.voxelManager;
    }

    ({ imageData: segmentationImageData } = segmentationVolume);
    // segmentationDimensions = segmentationVolume.dimensions;
  } else {
    const { segmentationId } = operationData as LabelmapToolOperationDataStack;

    const labelmapImageId = getCurrentLabelmapImageIdForViewport(
      viewport.id,
      segmentationId
    );
    if (!labelmapImageId) {
      return;
    }

    const currentImageId = viewport.getCurrentImageId();
    if (!currentImageId) {
      return;
    }

    const actorEntry = getLabelmapActorEntry(viewport.id, segmentationId);

    if (!actorEntry) {
      return;
    }

    const currentSegImage = cache.getImage(labelmapImageId);
    segmentationImageData = actorEntry.actor.getMapper().getInputData();
    segmentationVoxelManager = currentSegImage.voxelManager;
    const currentSegmentationImageId = operationData.imageId;

    const segmentationImage = cache.getImage(currentSegmentationImageId);
    if (!segmentationImage) {
      return;
    }
    segmentationScalarData = segmentationImage.getPixelData?.();

    const image = cache.getImage(currentImageId);
    const imageData = image ? null : viewport.getImageData();

    // VERY IMPORTANT
    // This is the pixel data of the image that is being segmented in the cache
    // and we need to use this to for the modification
    imageScalarData = image?.getPixelData() || imageData.getScalarData();
    imageVoxelManager = image?.voxelManager;
  }

  return {
    // image data
    segmentationImageData,
    // scalar data
    segmentationScalarData,
    imageScalarData,
    // voxel managers
    segmentationVoxelManager,
    imageVoxelManager,
  };
}

export { getStrategyData };
