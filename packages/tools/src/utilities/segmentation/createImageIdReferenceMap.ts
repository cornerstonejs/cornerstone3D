/**
 * Creates a map that associates each imageId with a set of segmentation imageIds.
 * Note that this function assumes that the imageIds and segmentationImageIds arrays
 * are the same length and same order.
 *
 * @param imageIdsArray - An array of imageIds.
 * @param segmentationImageIds - An array of segmentation imageIds.
 * @returns A map that maps each imageId to a set of segmentation imageIds.
 */
function createImageIdReferenceMap(
  imageIdsArray: string[],
  segmentationImageIds: string[]
): Map<string, Set<string>> {
  const imageIdReferenceMap = new Map<string, Set<string>>(
    imageIdsArray.map((imageId, index) => {
      const derivedSet = new Set<string>();
      derivedSet.add(segmentationImageIds[index]);

      return [imageId, derivedSet];
    })
  );

  return imageIdReferenceMap;
}

export { createImageIdReferenceMap };
