import type { Types } from '@cornerstonejs/core';
import { cache } from '@cornerstonejs/core';
import { getSegmentation } from './getSegmentation';
import type { LabelmapSegmentationDataVolume } from '../../types/LabelmapTypes';
import { updateStackSegmentationState } from './helpers/updateStackSegmentationState';

// This function is responsible for the conversion calculations
export async function computeStackSegmentationFromVolume({
  volumeId,
}: {
  volumeId: string;
}): Promise<{ imageIds: string[] }> {
  const segmentationVolume = cache.getVolume(volumeId) as Types.IImageVolume;

  return { imageIds: segmentationVolume.imageIds };
}

// Updated original function to call the new separate functions
export async function convertVolumeToStackSegmentation({
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

  const { volumeId } = segmentation.representationData
    .LABELMAP as LabelmapSegmentationDataVolume;
  const segmentationVolume = cache.getVolume(volumeId) as Types.IImageVolume;

  await updateStackSegmentationState({
    segmentationId,
    viewportId: options.viewportId,
    imageIds: segmentationVolume.imageIds,
    options,
  });
}
