import { cache, eventTarget } from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../../enums';
import { getSegmentation } from '../getSegmentation';
import type { LabelmapSegmentationDataVolume } from '../../../types/LabelmapTypes';
import { triggerSegmentationDataModified } from '../triggerSegmentationEvents';
import { addSegmentationRepresentations } from '../addSegmentationRepresentations';

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
      .Labelmap as LabelmapSegmentationDataVolume;
    if (cache.getVolume(data.volumeId)) {
      cache.removeVolumeLoadObject(data.volumeId);
    }

    segmentation.representationData.Labelmap = {
      imageIds,
    };
  } else {
    segmentation.representationData.Labelmap = {
      ...segmentation.representationData.Labelmap,
      imageIds,
    };
  }

  await addSegmentationRepresentations(viewportId, [
    {
      segmentationId,
      type: SegmentationRepresentations.Labelmap,
    },
  ]);

  eventTarget.addEventListenerOnce(Events.SEGMENTATION_RENDERED, () =>
    triggerSegmentationDataModified(segmentationId)
  );
}
