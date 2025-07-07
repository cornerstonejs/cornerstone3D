import { utilities, cache } from '@cornerstonejs/core';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import getOrCreateSegmentationVolume from '../../../../utilities/segmentation/getOrCreateSegmentationVolume';

export interface EnsureSegmentationVolumeData {
  operationData: {
    segmentationId: string;
    imageIds?: string[];
    segmentationVoxelManager?: unknown;
    segmentationImageData?: unknown;
  };
  viewport?: {
    getImageIds: () => string[];
  };
}

export default {
  [StrategyCallbacks.EnsureSegmentationVolumeFor3DManipulation]: (
    operationData
  ) => {
    // Extract or cast as needed
    const { operationData: opData, viewport } = operationData;
    const { segmentationId, imageIds: segImageIds } = opData || {};

    let referencedImageIds: string[] | undefined;
    if (viewport) {
      referencedImageIds = viewport.getImageIds();
    } else if (Array.isArray(segImageIds)) {
      referencedImageIds = segImageIds
        .map((imageId: string) => {
          const img = cache.getImage(imageId);
          return img ? img.referencedImageId : undefined;
        })
        .filter(Boolean) as string[];
    } else {
      throw new Error('No viewport or segmentation image IDs provided');
    }

    if (!referencedImageIds || referencedImageIds.length === 0) {
      throw new Error(
        `No referenced image IDs found for segmentation ${segmentationId}`
      );
    }

    const isValidVolumeForSphere = utilities.isValidVolume(referencedImageIds);
    if (!isValidVolumeForSphere) {
      throw new Error(
        `Volume is not reconstructable for sphere manipulation (segmentationId: ${segmentationId})`
      );
    }

    let segVolumes;
    try {
      segVolumes = getOrCreateSegmentationVolume(segmentationId);
    } catch (e) {
      throw new Error(
        'Failed to get or create segmentation volume: ' +
          (e instanceof Error ? e.message : e)
      );
    }

    if (!segVolumes) {
      throw new Error('No segmentation volume(s) found or created');
    }

    const segVolume = Array.isArray(segVolumes) ? segVolumes[0] : segVolumes;

    operationData.segmentationVoxelManager = segVolume.voxelManager;
    operationData.segmentationImageData = segVolume.imageData;
    return;
  },
};
