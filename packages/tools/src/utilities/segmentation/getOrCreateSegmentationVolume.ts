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
  const { volumeId, volumeIds } =
    representationData.Labelmap as LabelmapSegmentationDataVolume;

  let segVolume;
  // Check for single volumeId
  if (volumeId) {
    segVolume = cache.getVolume(volumeId);
    if (segVolume) {
      return segVolume;
    }
  }
  // Check for multiple volumeIds
  if (Array.isArray(volumeIds) && volumeIds.length > 0) {
    const segVolumes = volumeIds
      .map((id) => cache.getVolume(id))
      .filter(Boolean);
    if (segVolumes.length === 1) {
      return segVolumes[0];
    } else if (segVolumes.length > 1) {
      return segVolumes;
    }
  }

  const { imageIds: labelmapImageIds } =
    representationData.Labelmap as LabelmapSegmentationDataStack;

  // Multi-volume support: use numberOfImages to split flat array
  const stackData =
    representationData.Labelmap as LabelmapSegmentationDataStack;
  if (
    stackData &&
    stackData.numberOfImages &&
    stackData.imageIds.length > stackData.numberOfImages
  ) {
    const numVolumes = Math.floor(
      stackData.imageIds.length / stackData.numberOfImages
    );
    const volumes = [];
    const newVolumeIds = [];
    for (let i = 0; i < numVolumes; i++) {
      const ids = stackData.imageIds.slice(
        i * stackData.numberOfImages,
        (i + 1) * stackData.numberOfImages
      );
      const vol = getOrCreateSingleSegmentationVolume(ids);
      if (vol) {
        volumes.push(vol);
        newVolumeIds.push(vol.volumeId);
      }
    }
    // Assign volumeIds if not present
    if ((!volumeIds || volumeIds.length === 0) && newVolumeIds.length > 0) {
      (
        representationData.Labelmap as LabelmapSegmentationDataVolume
      ).volumeIds = newVolumeIds;
    }
    if (volumes.length === 1) {
      // Also assign volumeId for backward compatibility
      (representationData.Labelmap as LabelmapSegmentationDataVolume).volumeId =
        newVolumeIds[0];
      return volumes[0];
    } else if (volumes.length > 1) {
      return volumes;
    } else {
      return undefined;
    }
  }

  // Single volume case
  const singleVol = getOrCreateSingleSegmentationVolume(
    labelmapImageIds as string[]
  );
  if (singleVol) {
    // Assign volumeId if not present
    if (!volumeId) {
      (representationData.Labelmap as LabelmapSegmentationDataVolume).volumeId =
        singleVol.volumeId;
    }
    return singleVol;
  }
  return undefined;
}

export default getOrCreateSegmentationVolume;
