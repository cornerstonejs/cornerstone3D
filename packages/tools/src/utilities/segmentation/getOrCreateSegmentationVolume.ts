import { cache, volumeLoader, utilities } from '@cornerstonejs/core';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import type { LabelmapSegmentationDataStack } from '../../types/LabelmapTypes';

function getOrCreateSegmentationVolume(segmentationId) {
  const volumeId = `${segmentationId}_volume`;
  let segVolume = cache.getVolume(volumeId);

  if (segVolume) {
    return segVolume;
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

  return segVolume;
}

export default getOrCreateSegmentationVolume;
