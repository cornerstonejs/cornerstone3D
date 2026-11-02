import { Enums, imageLoader, metaData } from '@cornerstonejs/core';

const { MetadataModules } = Enums;

/**
 * preloads imageIds metadata in memory
 *
 * Loading an imageId through the registered image loader also parses and caches
 * the instance metadata, which is what the frame expansion below needs in order
 * to know how many frames an instance has.
 **/
async function prefetchMetadataInformation(imageIdsToPrefetch) {
  for (let i = 0; i < imageIdsToPrefetch.length; i++) {
    const imageId = imageIdsToPrefetch[i];

    if (metaData.get(MetadataModules.NATURALIZED, imageId)) {
      continue;
    }

    await imageLoader.loadAndCacheImage(imageId);
  }
}

function getFrameInformation(imageId) {
  if (imageId.includes('wadors:')) {
    const frameIndex = imageId.indexOf('/frames/');
    const imageIdFrameless =
      frameIndex > 0 ? imageId.slice(0, frameIndex + 8) : imageId;
    return {
      frameIndex,
      imageIdFrameless,
    };
  } else {
    const frameIndex = imageId.indexOf('&frame=');
    let imageIdFrameless =
      frameIndex > 0 ? imageId.slice(0, frameIndex + 7) : imageId;
    if (!imageIdFrameless.includes('&frame=')) {
      imageIdFrameless = imageIdFrameless + '&frame=';
    }
    return {
      frameIndex,
      imageIdFrameless,
    };
  }
}

/**
 * Expands an imageId using the legacy `multiframeModule` metadata, which is only
 * registered when the demo runs with the legacy metadata providers.
 */
function convertLegacyMultiframeImageId(imageId) {
  const instanceMetaData = metaData.get(MetadataModules.MULTIFRAME, imageId);

  if (!(instanceMetaData?.NumberOfFrames > 1)) {
    return [imageId];
  }

  const { imageIdFrameless } = getFrameInformation(imageId);

  const newImageIds = [];
  for (let i = 0; i < instanceMetaData.NumberOfFrames; i++) {
    newImageIds.push(imageIdFrameless + (i + 1));
  }

  return newImageIds;
}

/**
 * Receives a list of imageids possibly referring to multiframe dicom images
 * and returns a list of imageid where each imageid referes to one frame.
 * For each imageId representing a multiframe image with n frames,
 * it will create n new imageids, one for each frame, and returns the new list of imageids
 * If a particular imageid no refer to a mutiframe image data, it will be just copied into the new list
 *
 * The metadata of the imageIds needs to have been loaded already, see
 * `prefetchMetadataInformation`.
 *
 * @returns new list of imageids where each imageid represents a frame
 */
function convertMultiframeImageIds(imageIds) {
  return imageIds.flatMap((imageId) => {
    const baseImageId =
      metaData.getTyped(MetadataModules.BASE_IMAGE_ID, imageId) ?? imageId;
    const frameImageIds = metaData.getTyped(
      MetadataModules.FRAME_IMAGE_IDS,
      baseImageId
    );

    if (!frameImageIds) {
      return convertLegacyMultiframeImageId(imageId);
    }

    // Single frame instances keep their original imageId, only multiframe
    // instances are expanded into one imageId per frame.
    return frameImageIds.size > 1 ? [...frameImageIds] : [imageId];
  });
}

export { convertMultiframeImageIds, prefetchMetadataInformation };
