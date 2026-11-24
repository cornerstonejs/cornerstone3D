import {
  cache,
  volumeLoader,
  utilities as csUtils,
  type Types,
} from '@cornerstonejs/core';

/**
 * Gets an existing image volume from cache or creates a new one from the provided image IDs.
 * The volume id is the one that a planar viewport in volume mode and a 3D viewport give
 * the same image ids (`utilities.getDefaultVolumeId`), so the tools and the viewports find
 * one volume in the cache.
 * @param referencedImageIds - Array of image IDs to create the volume from
 * @returns The image volume or undefined if volume cannot be created
 */
function getOrCreateImageVolume(
  referencedImageIds: string[]
): Types.IImageVolume | undefined {
  if (!referencedImageIds?.length) {
    return;
  }

  const isValidVolume = csUtils.isValidVolume(referencedImageIds);

  if (!isValidVolume) {
    return;
  }

  const volumeId = csUtils.getDefaultVolumeId(referencedImageIds);

  // Check if volume already exists in cache
  let imageVolume = cache.getVolume(volumeId);

  if (imageVolume) {
    return imageVolume;
  }

  // Create and cache the volume if it doesn't exist
  imageVolume = volumeLoader.createAndCacheVolumeFromImagesSync(
    volumeId,
    referencedImageIds
  );

  return imageVolume;
}

export default getOrCreateImageVolume;
