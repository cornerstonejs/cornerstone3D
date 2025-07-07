import type { Types } from '@cornerstonejs/core';
import { cache } from '@cornerstonejs/core';
import { getSegmentation } from '../getSegmentation';
import { updateStackSegmentationState } from '../helpers/updateStackSegmentationState';
import type { LabelmapSegmentationDataVolume } from '../../../types/LabelmapTypes';

/**
 * Computes stack labelmap data from a volume by extracting the imageIds.
 * This function retrieves the volume from cache and returns its associated imageIds.
 *
 * @param volumeId - The ID of the volume to extract imageIds from
 * @returns Promise resolving to an object containing the imageIds array
 */
export async function computeStackLabelmapFromVolume({
  volumeId,
}: {
  volumeId: string;
}): Promise<{ imageIds: string[] }> {
  const segmentationVolume = cache.getVolume(volumeId) as Types.IImageVolume;

  return { imageIds: segmentationVolume.imageIds };
}

/**
 * Converts a volume labelmap segmentation to a stack labelmap representation.
 * This function retrieves the segmentation data, extracts the first volumeId from the volumeIds array,
 * gets the corresponding volume from cache, and updates the stack segmentation state with the volume's imageIds.
 *
 * Note: Currently only handles the first volume. Multi-volume handling is planned for future implementation.
 *
 * @param segmentationId - The ID of the segmentation to convert
 * @param options - Configuration options for the conversion
 * @param options.viewportId - The viewport ID where the conversion should be applied
 * @param options.newSegmentationId - Optional new ID for the converted segmentation
 * @param options.removeOriginal - Whether to remove the original volume segmentation after conversion
 * @returns Promise that resolves when the conversion is complete, or undefined if segmentation not found
 */
export function convertVolumeToStackLabelmap({
  segmentationId,
  options,
}: {
  segmentationId: string;
  options?: {
    viewportId: string;
    newSegmentationId?: string;
    removeOriginal?: boolean;
  };
}): Promise<void> {
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    return;
  }

  const volumeIds = (
    segmentation.representationData.Labelmap as LabelmapSegmentationDataVolume
  ).volumeIds;
  if (!volumeIds || volumeIds.length === 0) {
    console.warn('No volumeIds found in segmentation representation data');
    return;
  }
  // TODO: Implement multiple volume handling
  const volumeId = volumeIds[0];
  const segmentationVolume = cache.getVolume(volumeId) as Types.IImageVolume;

  return updateStackSegmentationState({
    segmentationId,
    viewportId: options.viewportId,
    imageIds: segmentationVolume.imageIds,
    options,
  });
}
