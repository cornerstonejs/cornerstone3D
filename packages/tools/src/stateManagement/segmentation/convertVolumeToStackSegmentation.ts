import { Types, cache, utilities as csUtils } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../enums';
import addSegmentations from './addSegmentations';
import addSegmentationRepresentations from './addSegmentationRepresentations';
import {
  triggerSegmentationRender,
  createImageIdReferenceMap,
} from '../../utilities/segmentation';
import { getSegmentation, removeSegmentation } from './segmentationState';
import { LabelmapSegmentationDataVolume } from '../../types/LabelmapTypes';
import { triggerSegmentationDataModified } from './triggerSegmentationEvents';

/**
 * Converts a volume segmentation to a stack segmentation.
 *
 * @param params - The parameters for the conversion.
 * @param params.segmentationId - The segmentationId to convert.
 * @param [params.options] - The conversion options.
 * @param params.options.toolGroupId - The new toolGroupId that the new segmentation will belong to.
 * @param [params.options.newSegmentationId] -  The new segmentationId to use for the segmentation. If not provided, a new ID will be generated.
 * @param [params.options.removeOriginal] - Whether or not to remove the original segmentation. Defaults to true.
 *
 * @returns A promise that resolves when the conversion is complete.
 */
async function convertVolumeToStackSegmentation({
  segmentationId,
  options,
}: {
  segmentationId: string;
  options?: {
    toolGroupId: string;
    newSegmentationId?: string;
    removeOriginal?: boolean;
  };
}): Promise<void> {
  const segmentation = getSegmentation(segmentationId);

  const { toolGroupId } = options;
  const data = segmentation.representationData
    .LABELMAP as LabelmapSegmentationDataVolume;

  const segmentationVolume = cache.getVolume(
    data.volumeId
  ) as Types.IImageVolume;

  // There might be or might not be segmentationImageIds, if it is a volume
  // segmentation converted from stack segmentation, there will be segmentationImageIds
  // otherwise, if it is empty volume segmentation derived from
  // a volume that is not a stack, there will be no segmentationImageIds
  const segmentationImageIds = segmentationVolume.imageIds;

  // @ts-ignore
  let referencedImageIds = segmentationVolume.referencedImageIds;

  if (!referencedImageIds) {
    // check if the segmentation volume is derived from another volume and
    // whether if that volume has imageIds
    const referencedVolumeId = segmentationVolume.referencedVolumeId;
    const referencedVolume = cache.getVolume(referencedVolumeId);
    if (
      referencedVolume?.imageIds &&
      !referencedVolume.imageIds?.[0].startsWith('derived')
    ) {
      // if the referenced volume has imageIds, and itself is not derived from
      // another segmentation then we can use the imageIds from the referenced volume
      referencedImageIds = referencedVolume.imageIds;
    } else {
      throw new Error(
        'Cannot convert volume segmentation to stack segmentation, missing referencedImageIds'
      );
    }
  }

  if (!segmentationImageIds) {
    // if the segmentation volume is derived, it will not have imageIds
    // so we kind of need to create imageIds for it
  }

  const imageIdReferenceMap = createImageIdReferenceMap(
    referencedImageIds,
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
          imageIdReferenceMap,
        },
      },
    },
  ]);
  // Add the segmentation representation to the toolgroup
  await addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId: newSegmentationId,
      type: SegmentationRepresentations.Labelmap,
    },
  ]);

  triggerSegmentationRender(toolGroupId);
  // Note: It is crucial to trigger the data modified event. This ensures that the
  // old texture is updated to the GPU, especially in scenarios where it may not be getting updated.
  triggerSegmentationDataModified(newSegmentationId);
}

export { convertVolumeToStackSegmentation };
