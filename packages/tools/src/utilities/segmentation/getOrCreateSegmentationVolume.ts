import {
  cache,
  volumeLoader,
  utilities,
  type Types,
  ImageVolume,
} from '@cornerstonejs/core';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
import {
  ensureLabelmapState,
  getLabelmap,
  getOrCreateLabelmapVolume,
} from '../../stateManagement/segmentation/labelmapModel';
import { isDynamicLabelmapVolume } from '../../stateManagement/segmentation/labelmapModel/dynamicLabelmapVolume';

function getOrCreateSegmentationVolume(
  segmentationId: string
): Types.IImageVolume | undefined {
  const segmentation = getSegmentation(segmentationId);
  const { representationData } = segmentation;
  if (!representationData.Labelmap) {
    return;
  }

  // A 4D labelmap is one volume of the current time point, and not a volume
  // of the images of every time point.
  const primaryLayer = getLabelmap(
    segmentation,
    ensureLabelmapState(segmentation)?.primaryLabelmapId
  );
  const layerVolume = primaryLayer && getOrCreateLabelmapVolume(primaryLayer);
  if (isDynamicLabelmapVolume(layerVolume)) {
    return layerVolume;
  }

  let { volumeId } =
    representationData.Labelmap as LabelmapSegmentationDataVolume;

  let segVolume: ImageVolume;
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

  if (!labelmapImageIds || labelmapImageIds.length === 0) {
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
