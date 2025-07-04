import { utilities as csUtils } from '@cornerstonejs/core';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import type { LabelmapSegmentationDataStack } from '../../../../types';
import getOrCreateImageVolume from '../../../../utilities/segmentation/getOrCreateImageVolume';

export default {
  [StrategyCallbacks.EnsureImageVolumeFor3DManipulation]: (data) => {
    const { operationData, viewport } = data;

    let referencedImageIds;
    if (viewport) {
      referencedImageIds = viewport.getImageIds();
      const isValidVolumeForSphere = csUtils.isValidVolume(referencedImageIds);
      if (!isValidVolumeForSphere) {
        throw new Error(
          'Volume is not reconstructable for sphere manipulation'
        );
      }
    } else {
      const segmentation = getSegmentation(operationData.segmentationId);
      referencedImageIds = csUtils.getReferenceImageIds(
        (
          segmentation.representationData
            .Labelmap as LabelmapSegmentationDataStack
        ).imageIds
      );
    }

    const imageVolume = getOrCreateImageVolume(referencedImageIds);

    if (!imageVolume) {
      throw new Error('Failed to create or get image volume');
    }

    operationData.imageVoxelManager = imageVolume.voxelManager;
    operationData.imageData = imageVolume.imageData;
  },
};
