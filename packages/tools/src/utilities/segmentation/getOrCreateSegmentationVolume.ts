import {
  cache,
  volumeLoader,
  utilities,
  type Types,
} from '@cornerstonejs/core';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';

function getOrCreateSegmentationVolume(
  segmentationId
): Types.IImageVolume | undefined {
  const { representationData } = getSegmentation(segmentationId);
  let { volumeId } =
    representationData.Labelmap as LabelmapSegmentationDataVolume;

  let segVolume;
  if (volumeId) {
    segVolume = cache.getVolume(volumeId);

    if (segVolume) {
      return segVolume;
    }
  }

  const { imageIds: labelmapImageIds } =
    representationData.Labelmap as LabelmapSegmentationDataStack;

  volumeId = cache.generateVolumeId(labelmapImageIds);

  // We don't need to call `getStackSegmentationImageIdsForViewport` here
  // because we've already ensured the stack constructs a volume,
  // making the scenario for multi-image non-consistent metadata is not likely.

  if (!labelmapImageIds || labelmapImageIds.length === 1) {
    return;
  }

  const isValidVolume = utilities.isValidVolume(labelmapImageIds);

  if (!isValidVolume) {
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
