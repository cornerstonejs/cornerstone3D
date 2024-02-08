import { cache, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { isVolumeSegmentation } from './stackVolumeCheck';
import { LabelmapToolOperationDataStack } from '../../../../types';

const { VoxelManager } = utilities;

function getStrategyData({ operationData, viewport }) {
  let segmentationImageData, segmentationScalarData, imageScalarData;
  let imageDimensions: Types.Point3;
  let segmentationDimensions: Types.Point3;
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
      imageScalarData = imageVolume.getScalarData();
      imageDimensions = imageVolume.dimensions;
    }

    ({ imageData: segmentationImageData } = segmentationVolume);
    segmentationScalarData = segmentationVolume.getScalarData();
    segmentationDimensions = segmentationVolume.dimensions;
  } else {
    const { imageIdReferenceMap, segmentationRepresentationUID } =
      operationData as LabelmapToolOperationDataStack;

    if (!imageIdReferenceMap) {
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
    segmentationImageData = actor.actor.getMapper().getInputData();
    segmentationVoxelManager = segmentationImageData.voxelManager;
    const currentSegmentationImageId = imageIdReferenceMap.get(currentImageId);

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
    imageDimensions = image
      ? [image.columns, image.rows, 1]
      : imageData.dimensions;
    segmentationDimensions = [
      segmentationImage.columns,
      segmentationImage.rows,
      1,
    ];
    imageVoxelManager = image?.voxelManager;
  }

  segmentationVoxelManager ||= VoxelManager.createVolumeVoxelManager(
    segmentationDimensions,
    segmentationScalarData
  );

  imageVoxelManager ||=
    imageDimensions &&
    VoxelManager.createVolumeVoxelManager(imageDimensions, imageScalarData);

  return {
    segmentationImageData,
    segmentationScalarData,
    segmentationVoxelManager,
    imageScalarData,
    imageVoxelManager,
  };
}

export { getStrategyData };
