import { utilities as csUtils } from '@cornerstonejs/core';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import type { LabelmapSegmentationDataStack } from '../../../../types';
import getOrCreateImageVolume from '../../../../utilities/segmentation/getOrCreateImageVolume';

// Type for the expected data structure
export interface EnsureImageVolumeData {
  operationData: {
    segmentationId: string;
    imageVoxelManager?: unknown;
    imageData?: unknown;
  };
  viewport?: {
    getImageIds: () => string[];
  };
}

export default {
  [StrategyCallbacks.EnsureImageVolumeFor3DManipulation]: (operationData) => {
    // Extract or cast as needed
    const { operationData: opData, viewport } = operationData;

    let referencedImageIds: string[] | undefined;
    if (viewport) {
      referencedImageIds = viewport.getImageIds();
      const isValidVolumeForSphere = csUtils.isValidVolume(referencedImageIds);
      if (!isValidVolumeForSphere) {
        throw new Error(
          `Volume is not reconstructable for sphere manipulation (segmentationId: ${opData?.segmentationId})`
        );
      }
    } else {
      if (!opData?.segmentationId) {
        throw new Error('Missing segmentationId in operationData');
      }
      const segmentation = getSegmentation(opData.segmentationId);
      if (!segmentation?.representationData?.Labelmap) {
        throw new Error(
          `No labelmap representation found for segmentation: ${opData.segmentationId}`
        );
      }
      referencedImageIds = csUtils.getReferenceImageIds(
        (
          segmentation.representationData
            .Labelmap as LabelmapSegmentationDataStack
        ).imageIds
      );
    }

    if (!referencedImageIds) {
      throw new Error('Could not determine referenced image IDs');
    }

    let imageVolume;
    try {
      imageVolume = getOrCreateImageVolume(referencedImageIds);
    } catch (e) {
      throw new Error(
        'Failed to get or create image volume: ' +
          (e instanceof Error ? e.message : e)
      );
    }

    if (!imageVolume) {
      throw new Error('Failed to create or get image volume');
    }

    operationData.imageVoxelManager = imageVolume.voxelManager;
    operationData.imageData = imageVolume.imageData;
  },
};
