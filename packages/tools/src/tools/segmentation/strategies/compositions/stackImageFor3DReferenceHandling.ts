import { cache, utilities as csUtils, volumeLoader } from '@cornerstonejs/core';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import type { InitializedOperationData } from '../BrushStrategy';

export default {
  [StrategyCallbacks.HandleStackImageReferenceFor3DManipulation]: (
    operationData: InitializedOperationData
  ) => {
    const { viewport, overrides } = operationData;

    const referencedImageIds = viewport.getImageIds();
    const isValidVolumeForSphere = csUtils.isValidVolume(referencedImageIds);
    if (!isValidVolumeForSphere) {
      throw new Error('Volume is not reconstructable for sphere manipulation');
    }

    const volumeId = csUtils.uuidv4();
    let imageVolume = cache.getVolume(volumeId);
    if (imageVolume) {
      overrides.imageVoxelManager = imageVolume.voxelManager;
      overrides.imageData = imageVolume.imageData;
      return;
    }

    // it will return the cached volume if it already exists
    imageVolume = volumeLoader.createAndCacheVolumeFromImagesSync(
      volumeId,
      referencedImageIds
    );

    overrides.imageVoxelManager = imageVolume.voxelManager;
    overrides.imageData = imageVolume.imageData;
  },
};
