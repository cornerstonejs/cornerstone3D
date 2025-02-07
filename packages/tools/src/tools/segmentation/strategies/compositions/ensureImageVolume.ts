import { cache, utilities as csUtils, volumeLoader } from '@cornerstonejs/core';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

export default {
  [StrategyCallbacks.EnsureImageVolumeFor3DManipulation]: (data) => {
    const { operationData, viewport } = data;

    const referencedImageIds = viewport.getImageIds();
    const isValidVolumeForSphere = csUtils.isValidVolume(referencedImageIds);
    if (!isValidVolumeForSphere) {
      throw new Error('Volume is not reconstructable for sphere manipulation');
    }

    const volumeId = cache.generateVolumeId(referencedImageIds);

    let imageVolume = cache.getVolume(volumeId);
    if (imageVolume) {
      operationData.imageVoxelManager = imageVolume.voxelManager;
      operationData.imageData = imageVolume.imageData;
      return;
    }

    // it will return the cached volume if it already exists
    imageVolume = volumeLoader.createAndCacheVolumeFromImagesSync(
      volumeId,
      referencedImageIds
    );

    operationData.imageVoxelManager = imageVolume.voxelManager;
    operationData.imageData = imageVolume.imageData;
  },
};
