import { cache } from '@cornerstonejs/core';
import { isVolumeSegmentation } from './stackVolumeCheck';
import { LabelmapToolOperationDataStack } from 'tools/src/types';

function getStrategyData({ operationData, viewport }) {
  let segmentationImageData, segmentationScalarData, imageScalarData;

  if (isVolumeSegmentation(operationData)) {
    const { volumeId, referencedVolumeId } = operationData;

    const segmentationVolume = cache.getVolume(volumeId);
    const imageVolume = cache.getVolume(referencedVolumeId);

    if (!segmentationVolume || !imageVolume) {
      return;
    }

    ({ imageData: segmentationImageData } = segmentationVolume);
    segmentationScalarData = segmentationVolume.getScalarData();
    imageScalarData = imageVolume.getScalarData();
  } else {
    const { imageIds, segmentationRepresentationUID } =
      operationData as LabelmapToolOperationDataStack;

    if (!imageIds) {
      return;
    }

    const currentImageId = viewport.getCurrentImageId();
    if (!currentImageId) {
      return;
    }

    const segmentationImageIds = imageIds;

    // we know that the segmentationRepresentationUID is the name of the actor always
    // and always circle modifies the current imageId which in fact is the imageData
    // of that actor at that moment so we have the imageData already
    const actor = viewport.getActor(segmentationRepresentationUID);
    segmentationImageData = actor.actor.getMapper().getInputData();
    const colonIndex = currentImageId.indexOf(':');
    const imageURI = currentImageId.substring(colonIndex + 1);
    const currentSegmentationImageId = segmentationImageIds.find((imageId) =>
      imageId.includes(imageURI)
    );

    const segmentationImage = cache.getImage(currentSegmentationImageId);
    segmentationScalarData = segmentationImage.getPixelData();

    const image = cache.getImage(currentImageId);

    // VERY IMPORTANT
    // This is the pixel data of the image that is being segmented in the cache
    // and we need to use this to for the modification
    imageScalarData = image.getPixelData();
  }

  return {
    segmentationImageData,
    segmentationScalarData,
    imageScalarData,
  };
}

export { getStrategyData };
