import {
  Types,
  cache,
  utilities as csUtils,
  eventTarget,
} from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../enums';
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
export async function convertVolumeToStackSegmentation({
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

  const imageIdReferenceMap =
    _getImageIdReferenceMapForStackSegmentation(segmentationVolume);

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
  eventTarget.addEventListenerOnce(Events.SEGMENTATION_RENDERED, () =>
    triggerSegmentationDataModified(newSegmentationId)
  );
}

function _getImageIdReferenceMapForStackSegmentation(
  segmentationVolume: Types.IImageVolume
) {
  // There might be or might not be segmentationImageIds, if it is a volume
  // segmentation converted from stack segmentation, there will be segmentationImageIds
  // otherwise, if it is empty volume segmentation derived from
  // a volume that is not a stack, there will be no segmentationImageIds
  const segmentationImageIds = segmentationVolume.imageIds;

  if (segmentationVolume.additionalDetails?.imageIdReferenceMap) {
    // this means the segmentation volume is derived from a stack segmentation
    // and we can use the imageIdReferenceMap from the additionalDetails
    return segmentationVolume.additionalDetails.imageIdReferenceMap;
  } else if (
    segmentationVolume.referencedImageIds?.length &&
    !segmentationVolume.referencedImageIds[0].startsWith('derived')
  ) {
    // this means the segmentation volume is derived from a stack segmentation
    // and we can use the referencedImageIds from the segmentationVolume
    const referencedImageIds = segmentationVolume.referencedImageIds;

    return createImageIdReferenceMap(referencedImageIds, segmentationImageIds);
  } else {
    // check if the segmentation volume is derived from another volume and
    // whether if that volume has imageIds
    const referencedVolumeId = segmentationVolume.referencedVolumeId;
    const referencedVolume = cache.getVolume(referencedVolumeId);

    if (!referencedVolume) {
      throw new Error(
        'Cannot convert volumetric segmentation without referenced volume to stack segmentation yet'
      );
    }

    if (!referencedVolume?.imageIds?.length) {
      throw new Error(
        'Cannot convert volumetric segmentation without imageIds to stack segmentation yet'
      );
    }

    if (referencedVolume.imageIds?.[0].startsWith('derived')) {
      throw new Error(
        `Cannot convert volume segmentation that is derived from another segmentation
         to stack segmentation yet, include the additionalDetails.imageIdReferenceMap
         in the volume segmentation in case you need it for the conversion`
      );
    }

    // if the referenced volume has imageIds, and itself is not derived from
    // another segmentation then we can use the imageIds from the referenced volume
    const referencedImageIds = referencedVolume.imageIds;

    return createImageIdReferenceMap(referencedImageIds, segmentationImageIds);
  }
}
