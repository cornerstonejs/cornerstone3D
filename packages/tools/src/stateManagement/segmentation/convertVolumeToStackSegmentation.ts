import {
  Types,
  cache,
  eventTarget,
  getRenderingEngines,
} from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../enums';
import addSegmentationRepresentations from './addSegmentationRepresentations';
import {
  triggerSegmentationRender,
  createImageIdReferenceMap,
} from '../../utilities/segmentation';
import { getSegmentation } from './segmentationState';
import { LabelmapSegmentationDataVolume } from '../../types/LabelmapTypes';
import { triggerSegmentationDataModified } from './triggerSegmentationEvents';

// This function is responsible for the conversion calculations
export async function computeStackSegmentationFromVolume({
  volumeId,
}: {
  volumeId: string;
}): Promise<{ imageIdReferenceMap: Map<string, string> }> {
  const segmentationVolume = cache.getVolume(volumeId) as Types.IImageVolume;

  // we need to decache the segmentation Volume so that we use it
  // for the conversion

  // So here we have two scenarios that we need to handle:
  // 1. the volume was derived from a stack and we need to decache it, this is easy
  // since we just need purge the volume from the cache and those images will get
  // their copy of the image back
  // 2. It was actually a native volume and we need to decache it, this is a bit more
  // complicated since then we need to decide on the imageIds for it to get
  // decached to
  const hasCachedImages = segmentationVolume.imageCacheOffsetMap.size > 0;
  // Initialize the variable to hold the final result
  let isAllImagesCached = false;

  if (hasCachedImages) {
    // Check if every imageId in the volume is in the _imageCache
    isAllImagesCached = segmentationVolume.imageIds.every((imageId) =>
      cache.getImage(imageId)
    );
  }

  //Todo: This is a hack to get the rendering engine
  const renderingEngine = getRenderingEngines()[0];
  const volumeUsedInOtherViewports = renderingEngine
    .getVolumeViewports()
    .find((vp) => vp.hasVolumeId(volumeId));

  segmentationVolume.decache(!volumeUsedInOtherViewports && isAllImagesCached);

  const imageIdReferenceMap =
    _getImageIdReferenceMapForStackSegmentation(segmentationVolume);

  // check if the imageIds have been cache, if not we should actually copy

  return { imageIdReferenceMap };
}

// Updated original function to call the new separate functions
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

  const data = segmentation.representationData
    .LABELMAP as LabelmapSegmentationDataVolume;
  const { imageIdReferenceMap } = await computeStackSegmentationFromVolume({
    volumeId: data.volumeId,
  });

  await updateStackSegmentationState({
    segmentationId,
    toolGroupId: options.toolGroupId,
    imageIdReferenceMap,
    options,
  });
}

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
export async function updateStackSegmentationState({
  segmentationId,
  toolGroupId,
  imageIdReferenceMap,
  options,
}: {
  segmentationId: string;
  toolGroupId: string;
  imageIdReferenceMap: Map<any, any>;
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
      imageIdReferenceMap,
    };
  } else {
    segmentation.representationData.LABELMAP = {
      ...segmentation.representationData.LABELMAP,
      imageIdReferenceMap,
    };
  }

  await addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId,
      type: SegmentationRepresentations.Labelmap,
    },
  ]);

  triggerSegmentationRender(toolGroupId);
  eventTarget.addEventListenerOnce(Events.SEGMENTATION_RENDERED, () =>
    triggerSegmentationDataModified(segmentationId)
  );
}

function _getImageIdReferenceMapForStackSegmentation(
  segmentationVolume: Types.IImageVolume
) {
  // There might be or might not be segmentationImageIds, if it is a volume
  // segmentation converted from stack segmentation, there will be segmentationImageIds
  // otherwise, if it is empty volume segmentation derived from
  // a volume that is not a stack, there will be no segmentationImageIds

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
    const segmentationImageIds = segmentationVolume.imageIds;

    return createImageIdReferenceMap(
      referencedImageIds,
      [...segmentationImageIds].reverse()
    );
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

    let segmentationImageIdsToUse = segmentationVolume.imageIds;
    if (!segmentationImageIdsToUse?.length) {
      // If segmentation Ids don't exist it means that the segmentation is literally
      // just a volume so we need to assume imageIds and decache it to the _imageCache
      // so that it can be used for the conversion
      segmentationImageIdsToUse =
        segmentationVolume.convertToImageSlicesAndCache();
    }

    return createImageIdReferenceMap(
      referencedImageIds,
      [...segmentationImageIdsToUse].reverse()
    );
  }
}
