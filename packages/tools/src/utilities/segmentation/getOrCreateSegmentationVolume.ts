import {
  cache,
  volumeLoader,
  utilities,
  type Types,
} from '@cornerstonejs/core';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import {
  addVolumeId,
  type LabelmapSegmentationDataStack,
  type LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';

/**
 * Returns a cached or newly created segmentation volume for the given imageIds.
 * If the volume does not exist, it is created and cached.
 *
 * @param imageIds - An array of imageIds representing a single volume.
 * @returns The cached or newly created IImageVolume, or undefined if invalid.
 */
function getOrCreateSingleSegmentationVolume(
  imageIds: string[]
): Types.IImageVolume | undefined {
  if (!imageIds || imageIds.length === 1) {
    return;
  }
  const isValid = utilities.isValidVolume(imageIds);
  if (!isValid) {
    return;
  }
  const volId = cache.generateVolumeId(imageIds);
  let vol = cache.getVolume(volId);
  if (!vol) {
    vol = volumeLoader.createAndCacheVolumeFromImagesSync(volId, imageIds);
  }
  return vol;
}

/**
 * Returns a cached or newly created segmentation volume(s) for the given segmentationId.
 * Handles both single and multi-volume segmentations. If the volume(s) do not exist, they are created and cached.
 *
 * - If a single volume is present, returns a single IImageVolume.
 * - If multiple volumes are present (multi-volume), returns an array of IImageVolume.
 * - If no valid volume(s) can be created, returns undefined.
 *
 * @param segmentationId - The segmentation ID for which to get or create the volume(s).
 * @returns The cached or newly created IImageVolume, an array of IImageVolume (for multi-volume), or undefined.
 */
function getOrCreateSegmentationVolume(
  segmentationId
): Types.IImageVolume | Types.IImageVolume[] | undefined {
  const { representationData } = getSegmentation(segmentationId);
  const volumeIds =
    (representationData.Labelmap as LabelmapSegmentationDataVolume).volumeIds ||
    [];

  // Check for multiple volumeIds
  if (volumeIds && Array.isArray(volumeIds) && volumeIds.length > 0) {
    const segVolumes = volumeIds
      .map((id) => cache.getVolume(id))
      .filter(Boolean);
    return segVolumes;
  }

  const { imageIds: labelmapImageIds } =
    representationData.Labelmap as LabelmapSegmentationDataStack;

  // Multi-volume support: use numberOfImages to split flat array
  const stackData =
    representationData.Labelmap as LabelmapSegmentationDataStack;
  const numberOfImages = utilities.getNumberOfReferenceImageIds(
    stackData.imageIds
  );
  if (
    stackData &&
    numberOfImages &&
    stackData.imageIds.length > numberOfImages
  ) {
    const numVolumes = Math.floor(stackData.imageIds.length / numberOfImages);
    const volumes = [];
    const newVolumeIds = [];
    for (let i = 0; i < numVolumes; i++) {
      const ids = stackData.imageIds.slice(
        i * numberOfImages,
        (i + 1) * numberOfImages
      );
      const vol = getOrCreateSingleSegmentationVolume(ids);
      if (vol) {
        volumes.push(vol);
        newVolumeIds.push(vol.volumeId);
        addVolumeId(
          representationData.Labelmap as LabelmapSegmentationDataVolume,
          vol.volumeId
        );
      }
    }
    return volumes;
  }
  return undefined;
}

export default getOrCreateSegmentationVolume;
