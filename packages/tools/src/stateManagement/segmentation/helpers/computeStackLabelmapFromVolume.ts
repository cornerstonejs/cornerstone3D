import type { Types } from '@cornerstonejs/core';
import { cache } from '@cornerstonejs/core';
import { getSegmentation } from '../getSegmentation';
import { updateStackSegmentationState } from '../helpers/updateStackSegmentationState';
import type { LabelmapSegmentationDataVolume } from '../../../types/LabelmapTypes';
import { getDynamicLabelmapImageIds } from '../labelmapModel/dynamicLabelmapVolume';

/** The labelmap images of a volume; every time point of a 4D labelmap. */
function getStackImageIds(segmentationVolume: Types.IImageVolume): string[] {
  return (
    getDynamicLabelmapImageIds(segmentationVolume) ??
    segmentationVolume.imageIds
  );
}

// This function is responsible for the conversion calculations
export async function computeStackLabelmapFromVolume({
  volumeId,
}: {
  volumeId: string;
}): Promise<{ imageIds: string[] }> {
  const segmentationVolume = cache.getVolume(volumeId) as Types.IImageVolume;

  return { imageIds: getStackImageIds(segmentationVolume) };
}

// Updated original function to call the new separate functions
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

  const { volumeId } = segmentation.representationData
    .Labelmap as LabelmapSegmentationDataVolume;
  const segmentationVolume = cache.getVolume(volumeId) as Types.IImageVolume;

  return updateStackSegmentationState({
    segmentationId,
    viewportId: options.viewportId,
    imageIds: getStackImageIds(segmentationVolume),
    options,
  });
}
