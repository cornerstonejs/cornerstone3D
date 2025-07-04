import cache from '../cache/cache';
/**
 * Returns the number of unique reference image IDs from a list of image IDs.
 * If an image ID has a referencedImageId, it will count that instead.
 *
 * @param {string[]} imageIds - An array of image IDs to check.
 * @returns {number} The number of unique reference image IDs.
 */
export function getNumberOfReferenceImageIds(imageIds: string[]): number {
  const uniqueReferenceImageIds = getReferenceImageIds(imageIds);
  return uniqueReferenceImageIds?.length;
}

/**
 * Returns an array of unique reference image IDs from a list of image IDs.
 * If an image ID has a referencedImageId, it will return that instead.
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
      const image = cache.getImage(imageId);
      if (!image) {
        return null; // Skip if image is undefined
      }
      return image.referencedImageId ? image.referencedImageId : image.imageId;
    })
    .filter((id): id is string => !!id); // Filter out nulls
  const uniqueReferenceImageIds = new Set(referenceImageIds);
  return Array.from(uniqueReferenceImageIds);
}
