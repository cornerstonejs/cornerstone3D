import { cache } from '@cornerstonejs/core';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import getOrCreateImageVolume from './getOrCreateImageVolume';
import {
  getReferencedVolumeId,
  type LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';

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

  let referenceImageIds: string[] | undefined;
  const labelmap = segmentation.representationData.Labelmap;

  // Case 1: Labelmap with imageIds (stack-based)
  if ('imageIds' in labelmap) {
    const { imageIds } = labelmap;
    if (!imageIds?.length) {
      return null;
    }
    const firstImage = cache.getImage(imageIds[0]);
    if (!firstImage) {
      return null;
    }
    const volumeInfo = cache.getVolumeContainingImageId(
      firstImage.referencedImageId
    );
    if (volumeInfo?.volume) {
      return volumeInfo.volume;
    }
    // Map image IDs to their referenced IDs, skipping missing images
    referenceImageIds = imageIds
      .map((imageId) => {
        const img = cache.getImage(imageId);
        return img ? img.referencedImageId : undefined;
      })
      .filter(Boolean) as string[];
  }
  // Case 2: Labelmap with volumeId (volume-based)
  else {
    const referencedVolumeId = getReferencedVolumeId(
      labelmap as LabelmapSegmentationDataVolume
    );
    if (referencedVolumeId) {
      const refVolume = cache.getVolume(referencedVolumeId);
      if (refVolume) {
        return refVolume;
      }
    } else {
      const volumeIds =
        (labelmap as LabelmapSegmentationDataVolume).volumeIds || [];
      const volumeId = volumeIds?.[0];
      if (!volumeId) {
        return null;
      }
      const segVolume = cache.getVolume(volumeId);
      if (segVolume && segVolume.imageIds) {
        referenceImageIds = segVolume.imageIds
          .map((imageId) => {
            const img = cache.getImage(imageId);
            return img ? img.referencedImageId : undefined;
          })
          .filter(Boolean) as string[];
      }
    }
  }

  if (!referenceImageIds || !referenceImageIds.length) {
    return null;
  }

  // Create and return image volume from reference image IDs
  return getOrCreateImageVolume(referenceImageIds);
}
