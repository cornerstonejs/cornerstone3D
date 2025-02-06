import { cache, utilities as csUtils, volumeLoader } from '@cornerstonejs/core';
import type { LabelmapSegmentationDataStack } from '../../../../types/LabelmapTypes';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';

export default {
  [StrategyCallbacks.EnsureSegmentationVolumeFor3DManipulation]: (data) => {
    const { operationData, viewport } = data;
    const { segmentationId } = operationData;

    const referencedImageIds = viewport.getImageIds();
    const isValidVolumeForSphere = csUtils.isValidVolume(referencedImageIds);
    if (!isValidVolumeForSphere) {
      throw new Error('Volume is not reconstructable for sphere manipulation');
    }

    const volumeId = `${segmentationId}_${viewport.id}`;
    let segVolume = cache.getVolume(volumeId);
    if (segVolume) {
      operationData.segmentationVoxelManager = segVolume.voxelManager;
      operationData.segmentationImageData = segVolume.imageData;
      return;
    }

    const { representationData } = getSegmentation(segmentationId);

    // We don't need to call `getStackSegmentationImageIdsForViewport` here
    // because we've already ensured the stack constructs a volume,
    // making the scenario for multi-image non-consistent metadata is not likely.
    const { imageIds: labelmapImageIds } =
      representationData.Labelmap as LabelmapSegmentationDataStack;

    if (!labelmapImageIds || labelmapImageIds.length === 1) {
      return;
    }

    // it will return the cached volume if it already exists
    segVolume = volumeLoader.createAndCacheVolumeFromImagesSync(
      volumeId,
      labelmapImageIds
    );

    operationData.segmentationVoxelManager = segVolume.voxelManager;
    operationData.segmentationImageData = segVolume.imageData;
    return;
  },
};
