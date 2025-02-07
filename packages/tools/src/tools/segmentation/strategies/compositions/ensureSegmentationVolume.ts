import { utilities } from '@cornerstonejs/core';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import getOrCreateSegmentationVolume from '../../../../utilities/segmentation/getOrCreateSegmentationVolume';

export default {
  [StrategyCallbacks.EnsureSegmentationVolumeFor3DManipulation]: (data) => {
    const { operationData, viewport } = data;
    const { segmentationId } = operationData;

    const referencedImageIds = viewport.getImageIds();
    const isValidVolumeForSphere = utilities.isValidVolume(referencedImageIds);
    if (!isValidVolumeForSphere) {
      throw new Error('Volume is not reconstructable for sphere manipulation');
    }

    const segVolume = getOrCreateSegmentationVolume(segmentationId);

    operationData.segmentationVoxelManager = segVolume.voxelManager;
    operationData.segmentationImageData = segVolume.imageData;
    return;
  },
};
