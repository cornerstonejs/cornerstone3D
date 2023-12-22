import {
  volumeLoader,
  utilities as csUtils,
  eventTarget,
} from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../enums';
import addSegmentations from './addSegmentations';
import addSegmentationRepresentations from './addSegmentationRepresentations';
import { triggerSegmentationRender } from '../../utilities/segmentation';
import { getSegmentation, removeSegmentation } from './segmentationState';
import { LabelmapSegmentationDataStack } from '../../types/LabelmapTypes';
import { triggerSegmentationDataModified } from './triggerSegmentationEvents';

/**
 * Converts a stack-based segmentation to a volume-based segmentation.
 *
 * @param params - The parameters for the conversion.
 * @param params.segmentationId - The segmentationId to convert.
 * @param [params.options] - The conversion options.
 * @param params.options.toolGroupId - The new toolGroupId to use for the segmentation.
 * @param [params.options.volumeId] - the new volumeId to use for the segmentation. If not provided, a new ID will be generated.
 * @param [params.options.newSegmentationId] - the new segmentationId to use for the segmentation. If not provided, a new ID will be generated.
 * @param [params.options.removeOriginal] - Whether or not to remove the original segmentation. Defaults to true.
 *
 * @returns A promise that resolves when the conversion is complete.
 */
async function convertStackToVolumeSegmentation({
  segmentationId,
  options,
}: {
  segmentationId: string;
  options?: {
    toolGroupId: string;
    volumeId?: string;
    newSegmentationId?: string;
    removeOriginal?: boolean;
  };
}): Promise<void> {
  const segmentation = getSegmentation(segmentationId);
  const { toolGroupId } = options;
  const data = segmentation.representationData
    .LABELMAP as LabelmapSegmentationDataStack;

  const imageIdReferenceMap = data.imageIdReferenceMap;

  const volumeId = options?.volumeId;

  // Get the imageIds from the imageIdReferenceMap
  // Todo: fix the scenario for multiple derived imageIds
  const segmentationImageIds = Array.from(imageIdReferenceMap.values()).map(
    (imageIdsSet) => [...imageIdsSet][0]
  );

  // Since segmentations are already cached and are not
  // loaded like volumes, we can create a volume out of their images
  await volumeLoader.createAndCacheVolumeFromImages(
    volumeId,
    segmentationImageIds
  );

  const newSegmentationId = options?.newSegmentationId ?? csUtils.uuidv4();

  if (options?.removeOriginal ?? true) {
    removeSegmentation(segmentationId);
  }

  await addSegmentations([
    {
      segmentationId: newSegmentationId,
      representation: {
        type: SegmentationRepresentations.Labelmap,
        data: {
          volumeId,
        },
      },
    },
  ]);

  await addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId: newSegmentationId,
      type: SegmentationRepresentations.Labelmap,
    },
  ]);

  triggerSegmentationRender(toolGroupId);
  // Note: It is crucial to trigger the data modified event. This ensures that the
  // old texture is updated to the GPU, especially in scenarios where it may not be getting updated.
  eventTarget.addEventListenerOnce(Events.SEGMENTATION_RENDERED, () =>
    triggerSegmentationDataModified(newSegmentationId)
  );
}

export { convertStackToVolumeSegmentation };
