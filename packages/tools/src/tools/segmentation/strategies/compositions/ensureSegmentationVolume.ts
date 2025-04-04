import { utilities, cache } from '@cornerstonejs/core';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import getOrCreateSegmentationVolume from '../../../../utilities/segmentation/getOrCreateSegmentationVolume';

export default {
  [StrategyCallbacks.EnsureSegmentationVolumeFor3DManipulation]: (data) => {
    const { operationData, viewport } = data;
    const { segmentationId, imageIds: segImageIds } = operationData;

    // Get referenced image IDs from viewport or from segmentation image IDs
    const referencedImageIds = viewport
      ? viewport.getImageIds()
      : segImageIds.map((imageId) => cache.getImage(imageId).referencedImageId);

    const isValidVolumeForSphere = utilities.isValidVolume(referencedImageIds);
    if (!isValidVolumeForSphere) {
      throw new Error('Volume is not reconstructable for sphere manipulation');
    }

    const segVolume = getOrCreateSegmentationVolume(segmentationId);

    if (!segVolume) {
      return;
    }

    operationData.segmentationVoxelManager = segVolume.voxelManager;
    operationData.segmentationImageData = segVolume.imageData;
    return;
  },
};
