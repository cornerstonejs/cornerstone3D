import { cache } from '@cornerstonejs/core';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types';
import getOrCreateImageVolume from './getOrCreateImageVolume';

/**
 * Retrieves the reference volume associated with a segmentation volume.
 * This function first checks if the segmentation volume has a direct reference
 * to a volume via referencedVolumeId. If not, it attempts to find the reference
 * volume by looking up the first image in the segmentation's imageIds array,
 * then finding its referenced image and the volume containing that image.
 *
 * @param segmentationId - The ID of the segmentation
 * @returns The reference volume if found, or null if the segmentation volume
 * doesn't exist or no reference volume could be determined
 */
export function getReferenceVolumeForSegmentation(segmentationId: string) {
  const segmentation = getSegmentation(segmentationId);
  if (!segmentation) {
    return null;
  }

  let referenceImageIds: string[];
  const labelmap = segmentation.representationData.Labelmap;

  // Case 1: Labelmap with imageIds (stack-based)
  if ('imageIds' in labelmap) {
    const { imageIds } = labelmap;

    const firstImage = cache.getImage(imageIds[0]);
    const volumeInfo = cache.getVolumeContainingImageId(
      firstImage.referencedImageId
    );
    if (volumeInfo?.volume) {
      return volumeInfo.volume;
    }

    // Map image IDs to their referenced IDs
    referenceImageIds = imageIds.map(
      (imageId) => cache.getImage(imageId).referencedImageId
    );
  }
  // Case 2: Labelmap with volumeId (volume-based)
  else if ('volumeId' in labelmap) {
    const { volumeId, referencedVolumeId } = labelmap;

    // Try to get directly referenced volume
    if (referencedVolumeId) {
      const refVolume = cache.getVolume(referencedVolumeId);
      if (refVolume) {
        return refVolume;
      }
    }

    const segVolume = cache.getVolume(volumeId);
    if (segVolume) {
      referenceImageIds = segVolume.imageIds.map(
        (imageId) => cache.getImage(imageId).referencedImageId
      );
    }
  }

  // Create and return image volume from reference image IDs
  return getOrCreateImageVolume(referenceImageIds);
}
