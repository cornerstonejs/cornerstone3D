import cache from '../cache/cache';
/**
 * Returns the number of unique reference image IDs from a list of image IDs.
 * For each imageId, if the cached image has a referencedImageId, it will use that;
 * otherwise, it will use the image's own imageId. If cache.getImage(imageId) returns undefined,
 * that imageId is skipped. The function returns the count of unique reference image IDs found.
 *
 * @param {string[]} imageIds - An array of image IDs to check.
 * @returns {number} The number of unique reference image IDs.
 */
export function getNumberOfReferenceImageIds(imageIds: string[]): number {
  if (!imageIds || imageIds.length === 0) {
    return 0;
  }

  const uniqueReferenceImageIds = getReferenceImageIds(imageIds);
  return uniqueReferenceImageIds.length;
}

/**
 * Returns an array of unique reference image IDs from a list of image IDs.
 * For each imageId, if the cached image has a referencedImageId, it will return that;
 * otherwise, it will return the image's own imageId. If cache.getImage(imageId) returns undefined,
 * that imageId is skipped. The returned array contains only unique reference image IDs.
 *
 * @param {string[]} imageIds - An array of image IDs to check.
 * @returns {string[]} An array of unique reference image IDs.
 */
export function getReferenceImageIds(imageIds: string[]): string[] {
  if (!imageIds || imageIds.length === 0) {
    return [];
  }

  const referenceImageIds = imageIds
    .map((imageId) => {
      if (!imageId || typeof imageId !== 'string') {
        return null; // Skip invalid imageIds
      }

      try {
        const image = cache.getImage(imageId);
        if (!image) {
          return null; // Skip if image is undefined
        }
        return image.referencedImageId
          ? image.referencedImageId
          : image.imageId;
      } catch (error) {
        console.warn(`Failed to get image for imageId: ${imageId}`, error);
        return null; // Skip if cache.getImage throws an error
      }
    })
    .filter((id): id is string => !!id); // Filter out nulls and falsy values

  const uniqueReferenceImageIds = new Set(referenceImageIds);
  return Array.from(uniqueReferenceImageIds);
}
