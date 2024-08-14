import { cache } from '@cornerstonejs/core';
import { isVolumeSegmentation } from './stackVolumeCheck';
import type { LabelmapToolOperationDataStack } from '../../../../types';
import { getCurrentLabelmapImageIdForViewport } from '../../../../stateManagement/segmentation/segmentationState';

function getStrategyData({ operationData, viewport }) {
  let segmentationImageData, segmentationScalarData, imageScalarData;
  let imageVoxelManager;
  let segmentationVoxelManager;

  if (isVolumeSegmentation(operationData, viewport)) {
    const { volumeId, referencedVolumeId } = operationData;

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
    const { segmentationRepresentationUID, segmentationId } =
      operationData as LabelmapToolOperationDataStack;

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

    // we know that the segmentationRepresentationUID is the name of the actor always
    // and always circle modifies the current imageId which in fact is the imageData
    // of that actor at that moment so we have the imageData already
    const actor = viewport.getActor(segmentationRepresentationUID);
    if (!actor) {
      return;
    }

    const currentSegImage = cache.getImage(labelmapImageId);
    segmentationImageData = actor.actor.getMapper().getInputData();
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
