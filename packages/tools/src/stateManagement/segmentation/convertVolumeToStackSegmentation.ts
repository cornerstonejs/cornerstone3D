import { Types, cache, eventTarget } from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../enums';
import addSegmentationRepresentations from './addSegmentationRepresentations';
import { triggerSegmentationRender } from '../../utilities/segmentation';
import { getSegmentation } from './segmentationState';
import { LabelmapSegmentationDataVolume } from '../../types/LabelmapTypes';
import { triggerSegmentationDataModified } from './triggerSegmentationEvents';

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

/**
 * Converts a volume segmentation to a stack segmentation.
 *
 * @param params - The parameters for the conversion.
 * @param params.segmentationId - The segmentationId to convert.
 * @param [params.options] - The conversion options.
 * @param params.options.viewportId - The viewportId to use for the segmentation.
 * @param [params.options.newSegmentationId] -  The new segmentationId to use for the segmentation. If not provided, a new ID will be generated.
 * @param [params.options.removeOriginal] - Whether or not to remove the original segmentation. Defaults to true.
 *
 * @returns A promise that resolves when the conversion is complete.
 */
export async function updateStackSegmentationState({
  segmentationId,
  viewportId,
  imageIds,
  options,
}: {
  segmentationId: string;
  viewportId: string;
  imageIds: string[];
  options?: {
    removeOriginal?: boolean;
  };
}): Promise<void> {
  const segmentation = getSegmentation(segmentationId);

  if (options?.removeOriginal) {
    const data = segmentation.representationData
      .LABELMAP as LabelmapSegmentationDataVolume;

    if (cache.getVolume(data.volumeId)) {
      cache.removeVolumeLoadObject(data.volumeId);
    }

    segmentation.representationData.LABELMAP = {
      imageIds,
    };
  } else {
    segmentation.representationData.LABELMAP = {
      ...segmentation.representationData.LABELMAP,
      imageIds,
    };
  }

  await addSegmentationRepresentations(viewportId, [
    {
      segmentationId,
      type: SegmentationRepresentations.Labelmap,
    },
  ]);

  triggerSegmentationRender(viewportId);
  eventTarget.addEventListenerOnce(Events.SEGMENTATION_RENDERED, () =>
    triggerSegmentationDataModified(segmentationId)
  );
}
