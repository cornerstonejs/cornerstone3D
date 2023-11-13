import { cache } from '@cornerstonejs/core';
import { isVolumeSegmentation } from './stackVolumeCheck';

function getStrategyData({ operationData, viewport }) {
  let segmentationImageData, segmentationScalarData, imageScalarData;

  if (
    isVolumeSegmentation(operationData.editData) ||
    Object.keys(operationData?.editData || {}).length === 0
  ) {
    const { segmentation: segmentationVolume, imageVolume } =
      operationData.editData;

    if (!segmentationVolume || !imageVolume) {
      return;
    }

    ({ imageData: segmentationImageData } = segmentationVolume);
    segmentationScalarData = segmentationVolume.getScalarData();
    imageScalarData = imageVolume.getScalarData();
  } else {
    const { editData, segmentationRepresentationUID } = operationData;
    const { currentImageId, segmentationImageIds } = editData;
    if (!currentImageId) {
      return;
    }

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
