import {
  volumeLoader,
  utilities as csUtils,
  eventTarget,
  cache,
} from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../enums';
import addSegmentationRepresentations from './addSegmentationRepresentations';
import { triggerSegmentationRender } from '../../utilities/segmentation';
import { getSegmentation } from './segmentationState';
import { LabelmapSegmentationDataStack } from '../../types/LabelmapTypes';
import { triggerSegmentationDataModified } from './triggerSegmentationEvents';

async function computeVolumeSegmentationFromStack({
  imageIdReferenceMap,
  options,
}: {
  imageIdReferenceMap: Map<string, string>;
  options?: {
    volumeId?: string;
  };
}): Promise<{ volumeId: string }> {
  const segmentationImageIds = Array.from(imageIdReferenceMap.values());

  const additionalDetails = {
    imageIdReferenceMap,
  };

  const volumeId = options?.volumeId ?? csUtils.uuidv4();

  await volumeLoader.createAndCacheVolumeFromImages(
    volumeId,
    segmentationImageIds,
    {
      additionalDetails,
    }
  );

  return { volumeId };
}

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
    removeOriginal?: boolean;
  };
}): Promise<void> {
  const segmentation = getSegmentation(segmentationId);

  const data = segmentation.representationData
    .LABELMAP as LabelmapSegmentationDataStack;

  const { volumeId } = await computeVolumeSegmentationFromStack({
    imageIdReferenceMap: data.imageIdReferenceMap,
    options,
  });

  await updateSegmentationState({
    segmentationId,
    toolGroupId: options.toolGroupId,
    options,
    volumeId,
  });
}

// This function is responsible for updating the segmentation state
async function updateSegmentationState({
  segmentationId,
  toolGroupId,
  volumeId,
  options,
}: {
  segmentationId: string;
  toolGroupId: string;
  volumeId: string;
  options?: {
    removeOriginal?: boolean;
  };
}): Promise<void> {
  const segmentation = getSegmentation(segmentationId);

  if (options?.removeOriginal) {
    const data = segmentation.representationData
      .LABELMAP as LabelmapSegmentationDataStack;

    const imageIdReferenceMap = data.imageIdReferenceMap;

    Array.from(imageIdReferenceMap.values()).forEach((imageId) => {
      cache.removeImageLoadObject(imageId);
    });

    segmentation.representationData.LABELMAP = {
      volumeId,
    };
  } else {
    segmentation.representationData.LABELMAP = {
      ...segmentation.representationData.LABELMAP,
      volumeId,
    };
  }

  await addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId,
      type: SegmentationRepresentations.Labelmap,
    },
  ]);

  triggerSegmentationRender(toolGroupId);
  // Note: It is crucial to trigger the data modified event. This ensures that the
  // old texture is updated to the GPU, especially in scenarios where it may not be getting updated.
  eventTarget.addEventListenerOnce(Events.SEGMENTATION_RENDERED, () =>
    triggerSegmentationDataModified(segmentationId)
  );
}

export { convertStackToVolumeSegmentation, computeVolumeSegmentationFromStack };
