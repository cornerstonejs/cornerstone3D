import { cache } from '@cornerstonejs/core';

/**
 * Retrieves the reference volume associated with a segmentation volume.
 * This function first checks if the segmentation volume has a direct reference
 * to a volume via referencedVolumeId. If not, it attempts to find the reference
 * volume by looking up the first image in the segmentation's imageIds array,
 * then finding its referenced image and the volume containing that image.
 *
 * @param segmentationVolumeId - The ID of the segmentation volume
 * @returns The reference volume if found, or null if the segmentation volume
 * doesn't exist or no reference volume could be determined
 */
export function getReferenceVolumeForSegmentationVolume(
  segmentationVolumeId: string
) {
  const segmentationVolume = cache.getVolume(segmentationVolumeId);

  if (!segmentationVolume) {
    return null;
  }

  const referencedVolumeId = segmentationVolume.referencedVolumeId;

  let imageVolume;

  // we only need the referenceVolumeId if we do thresholding
  // but for other operations we don't need it so make it optional
  if (referencedVolumeId) {
    imageVolume = cache.getVolume(referencedVolumeId);
  } else {
    // find the volume based on the imageIds
    const imageIds = segmentationVolume.imageIds;
    const image = cache.getImage(imageIds[0]);
    const referencedImageId = image.referencedImageId;
    let volumeInfo = cache.getVolumeContainingImageId(referencedImageId);
    if (!volumeInfo?.volume) {
      // If no volume contains the referenced image ID, the volume may have been
      // built from the segmentation's image IDs (e.g. createAndCacheVolumeFromImages
      // in _handleMissingVolume with derived IDs). Look up by the segmentation image's own ID.
      volumeInfo = cache.getVolumeContainingImageId(image.imageId);
    }
    imageVolume = volumeInfo?.volume;
  }

  return imageVolume;
}
